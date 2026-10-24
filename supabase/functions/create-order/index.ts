// create-order — creates a Cashfree order (server-side) and stores a pending order row.
// Secrets (CASHFREE_APP_ID / CASHFREE_SECRET_KEY) live only here, never in the browser.
//
// Marketplace commission:
//   - Every product sale records the platform commission and the creator payout.
//   - When CASHFREE_SPLIT_ENABLED=true AND the product's creator has a
//     cashfree_vendor_id (Easy Split vendor), the order is created with an
//     order-level split so Cashfree auto-settles the creator's share to their
//     account and the commission to the platform account.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, handleOptions } from '../_shared/cors.ts';

const CASHFREE_ENV = (Deno.env.get('CASHFREE_ENV') || 'sandbox').toLowerCase();
const CASHFREE_BASE = CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';
const API_VERSION = '2023-08-01';
const DEFAULT_COMMISSION = 10;

const PLAN_CATALOG: Record<string, { amount: number; label: string }> = {
  creator: { amount: 299, label: 'CreatorMarket Creator Pass — 30 days' },
  pro: { amount: 599, label: 'CreatorMarket Pro Pass — 30 days' },
};
const PROMO_CATALOG: Record<string, number> = { '1': 99, '3': 199, '7': 499 };

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }
function round2(n: number) { return Math.round(n * 100) / 100; }

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const appId = env('CASHFREE_APP_ID');
  const secretKey = env('CASHFREE_SECRET_KEY');
  if (!appId || !secretKey) return json({ message: 'Cashfree is not configured on the server.' }, 500);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ message: 'Supabase server environment variables are missing.' }, 500);

  try {
    // 1) Authenticate the caller.
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ message: 'Login required.' }, 401);
    const userClient = createClient(supabaseUrl, anonKey || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.id) return json({ message: 'Login required.' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const type = String(body.type || 'product');

    let amount = 0;
    let label = 'CreatorMarket purchase';
    let kind = type;
    let productId: string | null = null;
    let plan: string | null = null;
    let promoDays: number | null = null;
    let creatorId: string | null = null;

    if (type === 'product') {
      productId = String(body.product_id || '').trim();
      if (!productId) return json({ message: 'Product is required.' }, 400);
      const { data: rows, error } = await admin
        .from('products')
        .select('id,title,price,is_published,creator_id')
        .eq('id', productId)
        .limit(1);
      if (error || !rows || !rows.length) return json({ message: 'Product not found or unavailable.' }, 404);
      const product = rows[0];
      if (product.is_published === false) return json({ message: 'Product not found or unavailable.' }, 404);
      amount = Number(product.price);
      label = String(product.title || 'CreatorMarket product');
      creatorId = product.creator_id || null;
      if (!Number.isFinite(amount) || amount <= 0) return json({ message: 'This product is free; no payment is required.' }, 400);
    } else if (type === 'plan') {
      plan = String(body.plan || '').trim();
      const cfg = PLAN_CATALOG[plan];
      if (!cfg) return json({ message: 'Invalid plan.' }, 400);
      amount = cfg.amount;
      label = cfg.label;
    } else if (type === 'promotion') {
      productId = String(body.product_id || '').trim();
      promoDays = Number(body.promo_days || 0);
      const price = PROMO_CATALOG[String(promoDays)];
      if (!productId || !price) return json({ message: 'Invalid promotion.' }, 400);
      amount = price;
      label = `Product promotion — ${promoDays} day(s)`;
    } else {
      return json({ message: 'Unknown order type.' }, 400);
    }

    if (!Number.isFinite(amount) || amount <= 0) return json({ message: 'Invalid amount.' }, 400);

    // 2) Commission (only product sales have a creator).
    const commissionPercent = Number(env('COMMISSION_PERCENT')) || DEFAULT_COMMISSION;
    let commissionAmount: number | null = null;
    let creatorPayout: number | null = null;
    let vendorId: string | null = null;

    if (type === 'product' && creatorId) {
      commissionAmount = round2(amount * commissionPercent / 100);
      creatorPayout = round2(amount - commissionAmount);
      const { data: pay } = await admin
        .from('creator_payouts')
        .select('cashfree_vendor_id')
        .eq('creator_id', creatorId)
        .limit(1);
      vendorId = pay?.[0]?.cashfree_vendor_id || null;
    }

    // 3) Create the Cashfree order (with an Easy Split when available).
    const orderId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const origin = req.headers.get('Origin') || '';
    const returnUrl = env('CASHFREE_RETURN_URL') || (origin ? `${origin}/` : 'https://example.com/');

    const splitEnabled = env('CASHFREE_SPLIT_ENABLED') === 'true';
    const orderSplits = (splitEnabled && vendorId)
      ? [{ vendor_id: vendorId, percentage: round2(100 - commissionPercent) }]
      : null;

    const cfBody: Record<string, unknown> = {
      order_amount: amount,
      order_currency: 'INR',
      order_id: orderId,
      order_note: label.slice(0, 200),
      customer_details: {
        customer_id: String(user.id),
        customer_email: user.email || 'guest@creatormarket.app',
        customer_phone: (/^[0-9]{10,15}$/.test(String(body.customer_phone || '').replace(/[^0-9]/g, '')) ? String(body.customer_phone).replace(/[^0-9]/g, '') : '9999999999'),
      },
      order_meta: { return_url: returnUrl },
    };
    // NOTE: verify the exact split payload against your Cashfree Easy Split
    // configuration once the feature is activated on your account.
    if (orderSplits) cfBody.order_splits = orderSplits;

    const cfRes = await fetch(`${CASHFREE_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': API_VERSION,
        'x-client-id': appId,
        'x-client-secret': secretKey,
      },
      body: JSON.stringify(cfBody),
    });
    const cfData = await cfRes.json().catch(() => ({}));
    if (!cfRes.ok || !cfData?.payment_session_id) {
      return json({ message: cfData?.message || 'Unable to create Cashfree order.' }, cfRes.status || 502);
    }

    // 4) Store a pending order row (service role bypasses RLS).
    const { error: insErr } = await admin.from('orders').insert([{
      buyer_id: user.id,
      kind,
      product_id: productId,
      plan,
      promo_days: promoDays,
      amount,
      currency: 'INR',
      status: 'pending',
      cf_order_id: orderId,
      commission_percent: commissionAmount != null ? commissionPercent : null,
      commission_amount: commissionAmount,
      creator_payout: creatorPayout,
      vendor_id: vendorId,
    }]);
    if (insErr) console.warn('Pending order insert failed:', insErr.message);

    return json({
      order_id: orderId,
      payment_session_id: cfData.payment_session_id,
      amount,
      currency: 'INR',
      label,
      commission_percent: commissionAmount != null ? commissionPercent : null,
      commission_amount: commissionAmount,
      creator_payout: creatorPayout,
    });
  } catch (e) {
    console.error('create-order error:', e);
    return json({ message: 'Order creation failed.' }, 500);
  }
});
