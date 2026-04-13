import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/apiAuth';
import { enforceTrustedOrigin, getAvailablePmcAmount, setNoStoreHeaders } from '@/lib/serverSecurity';
import { isAuthorizedAdminRequest } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 설정이 누락되었습니다.');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/payments/toss/refund
 *
 * 관리자 전용 환불 처리 엔드포인트.
 * - Toss에 취소 요청을 보냄
 * - user_wallets에서 해당 orderId로 충전된 크레딧을 차감
 * - pmcEarn으로 적립된 PMC를 회수하고, pmcToUse로 사용된 PMC를 복구
 * - transactions에 환불 기록
 */
export async function POST(req: NextRequest) {
  try {
    const originError = enforceTrustedOrigin(req);
    if (originError) return originError;

    // 관리자 인증 필수
    const isAdmin = await isAuthorizedAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const targetUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    const cancelReason = typeof body?.reason === 'string' ? body.reason.trim() : '관리자 환불';

    if (!orderId || !targetUserId) {
      return NextResponse.json({ error: 'orderId와 userId는 필수입니다.' }, { status: 400 });
    }

    const db = getDb();
    const txDescription = `TOSS:${orderId}`;

    // 원본 구매 트랜잭션 조회
    const { data: originalTx } = await db
      .from('transactions')
      .select('id, amount, credits')
      .eq('user_id', targetUserId)
      .eq('description', txDescription)
      .eq('type', 'purchase')
      .limit(1)
      .single();

    if (!originalTx) {
      return NextResponse.json({ error: '해당 주문의 구매 내역을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 이미 환불된 주문인지 확인
    const { data: existingRefund } = await db
      .from('transactions')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('description', `REFUND:${orderId}`)
      .limit(1);

    if (existingRefund && existingRefund.length > 0) {
      return NextResponse.json({ error: '이미 환불 처리된 주문입니다.' }, { status: 409 });
    }

    // Toss 환불 API 호출
    const secretKey = process.env.TOSS_SECRET_KEY;
    if (secretKey) {
      const basicToken = Buffer.from(`${secretKey}:`).toString('base64');
      const tossRes = await fetch(`https://api.tosspayments.com/v1/payments/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cancelReason }),
      });

      if (!tossRes.ok) {
        const errData = await tossRes.json().catch(() => ({}));
        console.error('[refund] Toss cancel error:', errData?.code, errData?.message);
        return NextResponse.json(
          { error: '토스 환불 요청에 실패했습니다. 토스 대시보드에서 직접 처리하세요.' },
          { status: 502 }
        );
      }
    }

    // 지갑에서 해당 주문의 크레딧 차감 (원자적 처리)
    const purchasedCredits = (originalTx.credits as Record<string, number> | null) || {};
    const { data: walletData } = await db
      .from('user_wallets')
      .select('credits')
      .eq('user_id', targetUserId)
      .single();

    const currentCredits = (walletData?.credits as Record<string, number> | null) || {};
    const refundedCredits: Record<string, number> = {};

    for (const [modelId, qty] of Object.entries(purchasedCredits)) {
      const purchased = Math.max(0, Number(qty) || 0);
      const available = Number(currentCredits[modelId] || 0);
      // 실제 보유 크레딧 이상은 차감하지 않음
      const toDeduct = Math.min(purchased, available);
      if (toDeduct > 0) {
        currentCredits[modelId] = available - toDeduct;
        if (currentCredits[modelId] <= 0) delete currentCredits[modelId];
        refundedCredits[modelId] = -toDeduct;
      }
    }

    await db
      .from('user_wallets')
      .update({ credits: currentCredits, updated_at: new Date().toISOString() })
      .eq('user_id', targetUserId);

    // 환불 트랜잭션 기록
    await db.from('transactions').insert({
      user_id: targetUserId,
      type: 'usage',
      amount: -(originalTx.amount || 0),
      credits: refundedCredits,
      description: `REFUND:${orderId}`,
    });

    // PMC 처리: 해당 orderId로 적립된 PMC 회수 + 사용된 PMC 복구
    const { data: settingsData } = await db
      .from('user_settings')
      .select('data')
      .eq('user_id', targetUserId)
      .single();

    const settings = (settingsData?.data as Record<string, any> | null) || {};
    const pmcBalance = settings.pmcBalance || { amount: 0, history: [] };
    const history: any[] = Array.isArray(pmcBalance.history) ? [...pmcBalance.history] : [];
    const now = new Date();

    // 이 orderId로 적립된 PMC 찾아서 회수
    const earnEntry = history.find((h: any) => h.orderId === orderId && h.type === 'earn');
    if (earnEntry) {
      history.unshift({
        id: crypto.randomUUID(),
        type: 'use',
        amount: -earnEntry.amount,
        description: `환불로 인한 PMC 회수 (주문 ${orderId})`,
        orderId,
        expiresAt: now.toISOString(),
        createdAt: now.toISOString(),
      });
    }

    // 이 orderId로 사용된 PMC 찾아서 복구
    const useEntry = history.find((h: any) => h.orderId === orderId && h.type === 'use' && h.amount < 0 && h.description === '결제 시 사용');
    if (useEntry) {
      history.unshift({
        id: crypto.randomUUID(),
        type: 'earn',
        amount: Math.abs(useEntry.amount),
        description: `환불로 인한 PMC 복구 (주문 ${orderId})`,
        orderId,
        expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now.toISOString(),
      });
    }

    const nextPmcBalance = {
      amount: getAvailablePmcAmount({ amount: Number(pmcBalance.amount) || 0, history }),
      history,
    };

    await db.from('user_settings').upsert({
      user_id: targetUserId,
      data: { ...settings, pmcBalance: nextPmcBalance },
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id' });

    return setNoStoreHeaders(NextResponse.json({
      ok: true,
      refundedCredits,
      pmcAdjusted: {
        earnRevoked: earnEntry ? earnEntry.amount : 0,
        useRestored: useEntry ? Math.abs(useEntry.amount) : 0,
      },
    }));
  } catch (e) {
    console.error('[refund] Unexpected error:', e);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
