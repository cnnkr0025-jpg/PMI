import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest, NextResponse } from 'next/server';
import { initialModels } from '@/data/models';
import type { AIModel, ModelSelection, PMCBalance, UserPlan } from '@/types';
import { calculatePMCEarn, calculatePrice, defaultPolicy } from '@/utils/pricing';

export const SESSION_COOKIE_NAME = 'session';
export const ADMIN_COOKIE_NAME = 'admin_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const ADMIN_MAX_AGE_SECONDS = Math.max(300, Number(process.env.ADMIN_SESSION_MAX_AGE_SECONDS || '900'));

const APP_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  'https://pick-my-ai.com',
  'https://pickmyai.store',
  'https://www.pickmyai.store',
].filter((value): value is string => typeof value === 'string' && value.startsWith('http'));

const ORDER_TOKEN_AUDIENCE = 'pick-my-ai:payment-order';
const ORDER_TOKEN_ISSUER = 'pick-my-ai';

export function getIsProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getCookieSecurityOptions(maxAge: number, sameSite: 'lax' | 'strict' = 'lax') {
  return {
    httpOnly: true,
    secure: getIsProduction(),
    sameSite,
    maxAge,
    path: '/',
  } as const;
}

export function getClientIpFromRequest(request: NextRequest): string {
  const candidates = [
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-real-ip'),
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.length <= 128) {
      return candidate;
    }
  }

  return 'unknown';
}

export function getTrustedOrigins(): string[] {
  return APP_ORIGINS;
}

export function isTrustedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return APP_ORIGINS.some((allowedOrigin) => origin === allowedOrigin);
}

export function requestHasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  if (isTrustedOrigin(origin)) {
    return true;
  }

  if (referer) {
    return APP_ORIGINS.some((allowedOrigin) => referer.startsWith(allowedOrigin));
  }

  return false;
}

export function enforceTrustedOrigin(request: NextRequest): NextResponse | null {
  if (requestHasTrustedOrigin(request)) {
    return null;
  }

  return Response.json({ error: 'ERR_ORIGIN', reason: '허용되지 않은 요청 출처입니다.' }, { status: 403 }) as NextResponse;
}

export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function getAdminSecretPath(): string {
  return sanitizeAdminPath(process.env.ADMIN_SECRET_PATH || '');
}

export function sanitizeAdminPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

export function getRequestAdminPath(request: NextRequest): string {
  return sanitizeAdminPath(request.headers.get('x-admin-path') || '');
}

export function createRequestFingerprint(request: NextRequest, extra?: string): string {
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return crypto
    .createHash('sha256')
    .update([userAgent, getClientIpFromRequest(request), extra || ''].join('|'))
    .digest('hex');
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET은 최소 32자 이상이어야 합니다.');
  }
  return new TextEncoder().encode(secret);
}

export type SignedOrderPayload = {
  userId: string;
  orderId: string;
  credits: Record<string, number>;
  amount: number;
  pmcToUse: number;
  pmcEarn: number;
  requestedAmount: number;
  userPlan: UserPlan;
  selectionDigest: string;
};

export async function signOrderToken(payload: SignedOrderPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ORDER_TOKEN_ISSUER)
    .setAudience(ORDER_TOKEN_AUDIENCE)
    .setExpirationTime('20m')
    .sign(getJwtSecret());
}

export async function verifyOrderToken(token: string): Promise<SignedOrderPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: ORDER_TOKEN_ISSUER,
    audience: ORDER_TOKEN_AUDIENCE,
  });

  return {
    userId: String(payload.userId || ''),
    orderId: String(payload.orderId || ''),
    credits: (payload.credits as Record<string, number>) || {},
    amount: Number(payload.amount || 0),
    pmcToUse: Number(payload.pmcToUse || 0),
    pmcEarn: Number(payload.pmcEarn || 0),
    requestedAmount: Number(payload.requestedAmount || 0),
    userPlan: (payload.userPlan as UserPlan) || 'free',
    selectionDigest: String(payload.selectionDigest || ''),
  };
}

export function normalizeSelections(rawSelections: unknown): ModelSelection[] {
  if (!Array.isArray(rawSelections)) return [];

  const enabledModels = new Map(initialModels.filter((model: AIModel) => model.enabled).map((model: AIModel) => [model.id, model]));
  const normalized: ModelSelection[] = [];

  for (const item of rawSelections) {
    const modelId = typeof item?.modelId === 'string' ? item.modelId.trim() : '';
    const quantity = Math.floor(Number(item?.quantity));
    if (!modelId || !enabledModels.has(modelId) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
      continue;
    }
    normalized.push({ modelId, quantity });
  }

  const deduped = new Map<string, number>();
  for (const item of normalized) {
    deduped.set(item.modelId, Math.min(1000, (deduped.get(item.modelId) || 0) + item.quantity));
  }

  return Array.from(deduped.entries()).map(([modelId, quantity]) => ({ modelId, quantity }));
}

export function getAvailablePmcAmount(pmcBalance: PMCBalance | null | undefined): number {
  if (!pmcBalance?.history?.length) return 0;

  const now = Date.now();
  let available = 0;

  for (const tx of pmcBalance.history) {
    const amount = Number(tx.amount) || 0;
    const expiresAt = new Date(tx.expiresAt).getTime();
    if (tx.type === 'earn' && expiresAt > now) {
      available += amount;
    } else if (tx.type === 'use') {
      available += amount;
    }
  }

  return Math.max(0, Math.floor(available));
}

export function calculateSelectionDigest(credits: Record<string, number>): string {
  const normalized = Object.entries(credits)
    .filter(([modelId, quantity]) => typeof modelId === 'string' && Number.isFinite(quantity) && quantity > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function buildSecureOrder(rawSelections: unknown, userPlan: UserPlan, requestedPmcToUse: unknown, pmcBalance: PMCBalance | null | undefined) {
  const selections = normalizeSelections(rawSelections);
  if (selections.length === 0) {
    throw new Error('ERR_REQ_00 Invalid selections.');
  }

  const price = calculatePrice(initialModels, selections, defaultPolicy, false);
  const requestedPmc = Math.max(0, Math.floor(Number(requestedPmcToUse) || 0));
  const pmcInfo = calculatePMCEarn(initialModels, selections, price.finalTotal, userPlan);
  const availablePmc = getAvailablePmcAmount(pmcBalance);
  const pmcToUse = Math.min(requestedPmc, availablePmc, pmcInfo.maxUsable, price.finalTotal);
  const amount = Math.max(100, Math.round(price.finalTotal - pmcToUse));
  const credits = selections.reduce<Record<string, number>>((acc, item) => {
    acc[item.modelId] = item.quantity;
    return acc;
  }, {});
  const displayNames = selections
    .map((selection) => initialModels.find((model: AIModel) => model.id === selection.modelId)?.displayName)
    .filter((value): value is string => Boolean(value));

  return {
    selections,
    credits,
    amount,
    pmcToUse,
    pmcEarn: pmcInfo.earnAmount,
    orderName: displayNames.length <= 1 ? (displayNames[0] || 'Pick-My-AI 결제') : `${displayNames[0]} 외 ${displayNames.length - 1}건`,
    selectionDigest: calculateSelectionDigest(credits),
  };
}

export function setNoStoreHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
