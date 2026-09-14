import { Router, type IRouter, type Request, type Response } from 'express';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, subscriptionsTable } from '@workspace/db';

const router: IRouter = Router();
const STRIPE_API = 'https://api.stripe.com/v1';
const COOKIE_NAME = 'kiln_billing_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;

export const EMBER_PLANS = {
  free: { id: 'free', label: 'Free', model: 'openai/gpt-oss-20b', modelLabel: 'GPT-OSS 20B', dailyRequests: 10 },
  premium: { id: 'premium', label: 'Premium', model: 'openai/gpt-oss-120b', modelLabel: 'GPT-OSS 120B', dailyRequests: 100 },
  premium_plus: { id: 'premium_plus', label: 'Premium+', model: 'qwen/qwen3.6-27b', modelLabel: 'Qwen3.6 27B', dailyRequests: 250 },
} as const;

export type EmberPlanId = keyof typeof EMBER_PLANS;
type PaidPlan = 'premium' | 'premium_plus';
type StripeObject = Record<string, unknown>;

function billingSecret(): string {
  const secret = process.env.KILN_BILLING_COOKIE_SECRET;
  if (!secret) throw new Error('KILN_BILLING_COOKIE_SECRET is required for billing.');
  return secret;
}
function signSession(sessionId: string): string { return createHmac('sha256', billingSecret()).update(sessionId).digest('hex'); }
function makeCookieValue(sessionId: string): string { return `${sessionId}.${signSession(sessionId)}`; }
export function readBillingSessionId(req: Request): string | null {
  const raw = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const [sessionId, signature] = decodeURIComponent(match[1]).split('.');
  if (!sessionId || !signature) return null;
  const expected = signSession(sessionId);
  if (signature.length !== expected.length) return null;
  try { if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; } catch { return null; }
  return sessionId;
}
export function ensureBillingSession(req: Request, res: Response): string {
  const existing = readBillingSessionId(req);
  if (existing) return existing;
  const sessionId = randomUUID();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(makeCookieValue(sessionId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
  return sessionId;
}
export async function getEmberPlan(req: Request): Promise<EmberPlanId> {
  const sessionId = readBillingSessionId(req);
  if (!sessionId) return 'free';
  const rows = await db.select({ plan: subscriptionsTable.plan, status: subscriptionsTable.status }).from(subscriptionsTable).where(eq(subscriptionsTable.userId, sessionId)).limit(1);
  const row = rows[0];
  if (!row || (row.status !== 'active' && row.status !== 'trialing')) return 'free';
  return row.plan === 'premium_plus' ? 'premium_plus' : row.plan === 'premium' ? 'premium' : 'free';
}
function publicUrl(): string {
  const value = process.env.KILN_PUBLIC_URL;
  if (!value) throw new Error('KILN_PUBLIC_URL is required for Stripe Checkout.');
  return value.replace(/\/$/, '');
}
async function stripeRequest(path: string, init: RequestInit = {}): Promise<StripeObject> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('STRIPE_SECRET_KEY is not configured.');
  const response = await fetch(`${STRIPE_API}${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init.headers || {}) } });
  const data = await response.json() as StripeObject;
  if (!response.ok) {
    const error = data.error as StripeObject | undefined;
    throw new Error(typeof error?.message === 'string' ? error.message : `Stripe returned ${response.status}`);
  }
  return data;
}
function priceIdFor(plan: PaidPlan): string {
  const envName = plan === 'premium' ? 'STRIPE_PREMIUM_PRICE_ID' : 'STRIPE_PREMIUM_PLUS_PRICE_ID';
  const value = process.env[envName];
  if (!value) throw new Error(`${envName} is required for this plan.`);
  return value;
}
async function ensureSessionSubscription(sessionId: string): Promise<void> {
  const existing = await db.select({ id: subscriptionsTable.id }).from(subscriptionsTable).where(eq(subscriptionsTable.userId, sessionId)).limit(1);
  if (!existing.length) await db.insert(subscriptionsTable).values({ id: randomUUID(), userId: sessionId, plan: 'free', status: 'inactive' });
}
function unixDate(value: unknown): Date | null { return typeof value === 'number' ? new Date(value * 1000) : null; }
async function upsertSubscription(input: { userId: string; customerId?: string | null; subscriptionId?: string | null; plan: string; status: string; currentPeriodEnd?: Date | null }): Promise<void> {
  const existing = await db.select({ id: subscriptionsTable.id }).from(subscriptionsTable).where(eq(subscriptionsTable.userId, input.userId)).limit(1);
  const values = { userId: input.userId, stripeCustomerId: input.customerId ?? null, stripeSubscriptionId: input.subscriptionId ?? null, plan: input.plan, status: input.status, currentPeriodEnd: input.currentPeriodEnd ?? null, updatedAt: new Date() };
  if (existing.length) await db.update(subscriptionsTable).set(values).where(eq(subscriptionsTable.id, existing[0].id));
  else await db.insert(subscriptionsTable).values({ id: randomUUID(), ...values });
}

router.get('/billing/plans', (_req, res) => { res.json({ plans: Object.values(EMBER_PLANS) }); });
router.get('/billing/me', async (req, res) => {
  const sessionId = readBillingSessionId(req);
  if (!sessionId) { res.json({ plan: 'free', model: EMBER_PLANS.free.model, dailyRequests: EMBER_PLANS.free.dailyRequests }); return; }
  const rows = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, sessionId)).limit(1);
  const subscription = rows[0];
  const paid = subscription && (subscription.status === 'active' || subscription.status === 'trialing');
  const plan = paid && (subscription.plan === 'premium' || subscription.plan === 'premium_plus') ? subscription.plan : 'free';
  res.json({ plan, model: EMBER_PLANS[plan].model, dailyRequests: EMBER_PLANS[plan].dailyRequests, status: subscription?.status ?? 'inactive', currentPeriodEnd: subscription?.currentPeriodEnd ?? null });
});
router.post('/billing/checkout', async (req, res) => {
  const plan = req.body?.plan as PaidPlan;
  if (plan !== 'premium' && plan !== 'premium_plus') { res.status(400).json({ error: 'A paid plan is required.' }); return; }
  try {
    const sessionId = ensureBillingSession(req, res);
    await ensureSessionSubscription(sessionId);
    const body = new URLSearchParams({ mode: 'subscription', success_url: `${publicUrl()}/?billing=success`, cancel_url: `${publicUrl()}/?billing=cancelled`, client_reference_id: sessionId, 'line_items[0][price]': priceIdFor(plan), 'line_items[0][quantity]': '1', 'subscription_data[metadata][kiln_plan]': plan, 'subscription_data[metadata][kiln_session_id]': sessionId, 'metadata[kiln_plan]': plan, 'metadata[kiln_session_id]': sessionId });
    const checkout = await stripeRequest('/checkout/sessions', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (typeof checkout.url !== 'string') throw new Error('Stripe did not return a Checkout URL.');
    res.json({ url: checkout.url, plan });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Unable to start checkout.' }); }
});
router.post('/billing/portal', async (req, res) => {
  const sessionId = readBillingSessionId(req);
  if (!sessionId) { res.status(401).json({ error: 'No billing session found.' }); return; }
  try {
    const rows = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, sessionId)).limit(1);
    const customerId = rows[0]?.stripeCustomerId;
    if (!customerId) { res.status(400).json({ error: 'No Stripe customer is attached to this billing session.' }); return; }
    const portal = await stripeRequest('/billing_portal/sessions', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ customer: customerId, return_url: `${publicUrl()}/` }) });
    if (typeof portal.url !== 'string') throw new Error('Stripe did not return a portal URL.');
    res.json({ url: portal.url });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Unable to open billing portal.' }); }
});
router.post('/billing/webhook', async (req, res) => {
  const signature = typeof req.headers['stripe-signature'] === 'string' ? req.headers['stripe-signature'] : '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) { res.status(503).json({ error: 'Stripe webhook secret is not configured.' }); return; }
  const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const timestampPart = signature.split(',').find((part) => part.startsWith('t='));
  const signaturePart = signature.split(',').find((part) => part.startsWith('v1='));
  if (!timestampPart || !signaturePart) { res.status(400).json({ error: 'Invalid Stripe signature.' }); return; }
  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) { res.status(400).json({ error: 'Expired Stripe webhook.' }); return; }
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload.toString('utf8')}`).digest('hex');
  const supplied = signaturePart.slice(3);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) { res.status(400).json({ error: 'Invalid Stripe signature.' }); return; }
  try {
    const event = JSON.parse(payload.toString('utf8')) as { type?: string; data?: { object?: StripeObject } };
    const object = event.data?.object ?? {};
    const metadata = (object.metadata as StripeObject | undefined) ?? {};
    const sessionId = typeof metadata.kiln_session_id === 'string' ? metadata.kiln_session_id : null;
    const plan = metadata.kiln_plan === 'premium_plus' ? 'premium_plus' : metadata.kiln_plan === 'premium' ? 'premium' : 'free';
    const customerId = typeof object.customer === 'string' ? object.customer : null;
    const subscriptionId = typeof object.id === 'string' && event.type?.startsWith('customer.subscription.') ? object.id : typeof object.subscription === 'string' ? object.subscription : null;
    const status = typeof object.status === 'string' ? object.status : 'inactive';
    const periodEnd = unixDate(object.current_period_end);
    if (event.type === 'checkout.session.completed' && sessionId) await upsertSubscription({ userId: sessionId, customerId, subscriptionId, plan, status: 'active', currentPeriodEnd: periodEnd });
    else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') { if (sessionId) await upsertSubscription({ userId: sessionId, customerId, subscriptionId, plan, status, currentPeriodEnd: periodEnd }); }
    else if (event.type === 'customer.subscription.deleted') { if (sessionId) await upsertSubscription({ userId: sessionId, customerId, subscriptionId, plan: 'free', status: 'canceled', currentPeriodEnd: periodEnd }); }
    res.json({ received: true });
  } catch (error) { req.log.error({ err: error }, 'Stripe webhook processing failed'); res.status(500).json({ error: 'Webhook processing failed.' }); }
});

export default router;
