import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/apiAuth';
import { RateLimiter } from '@/lib/rateLimit';
import { buildSecureOrder, enforceTrustedOrigin, setNoStoreHeaders, signOrderToken } from '@/lib/serverSecurity';
import type { UserPlan } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paymentPrepareRateLimiter = new RateLimiter(20, 60 * 1000);

function getDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('결제 스토리지를 위한 Supabase 설정이 누락되었습니다.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: NextRequest) {
  try {
    const originError = enforceTrustedOrigin(request);
    if (originError) {
      return originError;
    }

    const session = await verifySession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ error: 'ERR_AUTH', reason: '로그인이 필요합니다.' }, { status: 401 });
    }

    const rl = paymentPrepareRateLimiter.check(session.userId);
    if (!rl.success) {
      return NextResponse.json({ error: 'ERR_RATE', reason: '요청이 너무 많습니다.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const db = getDb();
    const { data: settingsRow } = await db
      .from('user_settings')
      .select('data')
      .eq('user_id', session.userId)
      .single();

    const settings = (settingsRow?.data as Record<string, any> | null) || {};
    const rawUserPlan = typeof settings.userPlan === 'string' ? settings.userPlan : 'free';
    const userPlan: UserPlan = rawUserPlan === 'plus' || rawUserPlan === 'pro' || rawUserPlan === 'max' ? rawUserPlan : 'free';
    const pmcBalance = settings.pmcBalance ?? null;
    const secureOrder = buildSecureOrder(body?.selections, userPlan, body?.pmcToUse, pmcBalance);
    const orderId = `order_${crypto.randomUUID()}`;
    const orderToken = await signOrderToken({
      userId: session.userId,
      orderId,
      credits: secureOrder.credits,
      amount: secureOrder.amount,
      pmcToUse: secureOrder.pmcToUse,
      pmcEarn: secureOrder.pmcEarn,
      requestedAmount: secureOrder.amount,
      userPlan,
      selectionDigest: secureOrder.selectionDigest,
    });

    return setNoStoreHeaders(NextResponse.json({
      orderId,
      amount: secureOrder.amount,
      orderName: secureOrder.orderName,
      orderToken,
      pmcToUse: secureOrder.pmcToUse,
      pmcEarn: secureOrder.pmcEarn,
    }));
  } catch (error: any) {
    return NextResponse.json(
      { error: 'ERR_PREPARE', reason: error?.message || '결제 준비 중 오류가 발생했습니다.' },
      { status: 400 }
    );
  }
}
