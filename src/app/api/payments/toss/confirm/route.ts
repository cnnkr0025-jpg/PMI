import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/apiAuth';
import { enforceTrustedOrigin, getAvailablePmcAmount, setNoStoreHeaders, verifyOrderToken } from '@/lib/serverSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('결제 스토리지를 위한 Supabase 설정이 누락되었습니다.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(req: NextRequest) {
  try {
    const originError = enforceTrustedOrigin(req);
    if (originError) {
      return originError;
    }

    const session = await verifySession(req);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ error: 'ERR_AUTH', reason: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const paymentKey = typeof body?.paymentKey === 'string' ? body.paymentKey : '';
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const orderToken = typeof body?.orderToken === 'string' ? body.orderToken : '';
    const requestAmount = Number(body?.amount || 0);
    const isMockPayment = body?.isMockPayment === true || body?.isMockPayment === '1';

    if (!orderId || !orderToken || !Number.isFinite(requestAmount) || requestAmount <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (!isMockPayment && !paymentKey) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const signedOrder = await verifyOrderToken(orderToken);
    if (signedOrder.userId !== session.userId || signedOrder.orderId !== orderId || signedOrder.amount !== requestAmount) {
      return NextResponse.json({ error: 'ERR_ORDER', reason: '주문 검증에 실패했습니다.' }, { status: 403 });
    }

    let data: any;
    if (isMockPayment) {
      data = {
        method: 'MOCK',
        status: 'DONE',
        orderId,
        totalAmount: signedOrder.amount,
        approvedAt: new Date().toISOString(),
      };
    } else {
      const secretKey = process.env.TOSS_SECRET_KEY;
      if (!secretKey) {
        return NextResponse.json({ error: 'Server payment key not configured' }, { status: 500 });
      }

      const basicToken = Buffer.from(`${secretKey}:`).toString('base64');

      const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentKey, orderId, amount: signedOrder.amount }),
      });

      data = await response.json();

      if (!response.ok) {
        // 토스 원문 메시지는 서버 로그에만, 클라이언트에는 고정 메시지
        if (process.env.NODE_ENV !== 'production') {
          console.error('[toss/confirm] Toss API error:', data?.code, data?.message);
        }
        return NextResponse.json({ error: '결제 승인에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 400 });
      }
    }

    const db = getDb();
    const txDescription = `TOSS:${orderId}`;
    const existingTx = await db
      .from('transactions')
      .select('id')
      .eq('user_id', session.userId)
      .eq('description', txDescription)
      .limit(1);

    if (existingTx.data && existingTx.data.length > 0) {
      const walletResult = await db.from('user_wallets').select('credits').eq('user_id', session.userId).single();
      const settingsResult = await db.from('user_settings').select('data').eq('user_id', session.userId).single();
      return setNoStoreHeaders(NextResponse.json({
        ok: true,
        data,
        walletCredits: walletResult.data?.credits || {},
        settings: settingsResult.data?.data || null,
      }));
    }

    const walletResult = await db.from('user_wallets').select('credits').eq('user_id', session.userId).single();
    const currentCredits = (walletResult.data?.credits as Record<string, number> | null) || {};
    const mergedCredits = { ...currentCredits };
    for (const [modelId, qty] of Object.entries(signedOrder.credits)) {
      mergedCredits[modelId] = (mergedCredits[modelId] || 0) + Math.max(0, Number(qty) || 0);
    }

    await db
      .from('user_wallets')
      .upsert({
        user_id: session.userId,
        credits: mergedCredits,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    await db
      .from('transactions')
      .insert({
        user_id: session.userId,
        type: 'purchase',
        amount: signedOrder.amount,
        credits: signedOrder.credits,
        description: txDescription,
      });

    const settingsResult = await db.from('user_settings').select('data').eq('user_id', session.userId).single();
    const settings = (settingsResult.data?.data as Record<string, any> | null) || {};
    const currentPmc = settings.pmcBalance || { amount: 0, history: [] };
    const history = Array.isArray(currentPmc.history) ? [...currentPmc.history] : [];
    const now = new Date();

    if (signedOrder.pmcToUse > 0) {
      history.unshift({
        id: crypto.randomUUID(),
        type: 'use',
        amount: -signedOrder.pmcToUse,
        description: '결제 시 사용',
        orderId,
        expiresAt: now.toISOString(),
        createdAt: now.toISOString(),
      });
    }

    if (signedOrder.pmcEarn > 0) {
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 90);
      history.unshift({
        id: crypto.randomUUID(),
        type: 'earn',
        amount: signedOrder.pmcEarn,
        description: '결제 적립',
        orderId,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
      });
    }

    const nextPmcBalance = {
      amount: getAvailablePmcAmount({ amount: Number(currentPmc.amount) || 0, history }),
      history,
    };

    await db
      .from('user_settings')
      .upsert({
        user_id: session.userId,
        data: {
          ...settings,
          pmcBalance: nextPmcBalance,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    return setNoStoreHeaders(NextResponse.json({ ok: true, data, walletCredits: mergedCredits, settings: { ...settings, pmcBalance: nextPmcBalance } }));
  } catch (e: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[toss/confirm] Unexpected error:', e);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
