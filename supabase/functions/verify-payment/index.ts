// verify-payment — confirms the Cashfree order status server-side and marks the order paid.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, handleOptions } from '../_shared/cors.ts';

const CASHFREE_ENV = (Deno.env.get('CASHFREE_ENV') || 'sandbox').toLowerCase();
const CASHFREE_BASE = CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';
const API_VERSION = '2023-08-01';

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ verified: false, message: 'Method not allowed' }, 405);

  const appId = env('CASHFREE_APP_ID');
  const secretKey = env('CASHFREE_SECRET_KEY');
  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
  if (!appId || !secretKey) return json({ verified: false, message: 'Cashfree is not configured on the server.' }, 500);
  if (!supabaseUrl || !serviceKey) return json({ verified: false, message: 'Supabase server environment variables are missing.' }, 500);

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ verified: false, message: 'Login required.' }, 401);
    const userClient = createClient(supabaseUrl, anonKey || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.id) return json({ verified: false, message: 'Login required.' }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || '').trim();
    if (!orderId) return json({ verified: false, message: 'Order id is required.' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // The order must belong to the caller.
    const { data: rows, error } = await admin
      .from('orders')
      .select('id,status,amount,kind,product_id,plan,promo_days,cf_order_id')
      .eq('cf_order_id', orderId)
      .eq('buyer_id', user.id)
      .limit(1);
    if (error || !rows || !rows.length) return json({ verified: false, message: 'Order not found.' }, 404);
    const order = rows[0];

    // Ask Cashfree for the authoritative status.
    const cfHeaders = {
      'x-api-version': API_VERSION,
      'x-client-id': appId,
      'x-client-secret': secretKey,
    };
    const statusRes = await fetch(`${CASHFREE_BASE}/orders/${encodeURIComponent(orderId)}`, { headers: cfHeaders });
    const statusData = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) return json({ verified: false, message: statusData?.message || 'Could not read Cashfree order status.' }, 502);

    const orderStatus = String(statusData?.order_status || '').toUpperCase();
    if (orderStatus !== 'PAID') {
      return json({ verified: false, status: orderStatus, message: `Payment not completed (status: ${orderStatus || 'unknown'}).` }, 200);
    }

    // Fetch the payment id for the receipt.
    let paymentId: string | null = null;
    try {
      const payRes = await fetch(`${CASHFREE_BASE}/orders/${encodeURIComponent(orderId)}/payments`, { headers: cfHeaders });
      const payData = await payRes.json().catch(() => []);
      if (Array.isArray(payData) && payData.length) {
        const paid = payData.find((p) => String(p?.payment_status).toUpperCase() === 'SUCCESS') || payData[0];
        paymentId = paid?.cf_payment_id ? String(paid.cf_payment_id) : null;
      }
    } catch (_) { /* payment id is optional */ }

    // Mark the order paid.
    const { error: updErr } = await admin
      .from('orders')
      .update({ status: 'paid', payment_id: paymentId })
      .eq('id', order.id);
    if (updErr) {
      return json({ verified: false, message: 'Payment verified but order update failed. Do not retry payment; contact support.' }, 500);
    }

    return json({
      verified: true,
      order_id: orderId,
      payment_id: paymentId,
      kind: order.kind,
      product_id: order.product_id,
      plan: order.plan,
      promo_days: order.promo_days,
      amount: order.amount,
    });
  } catch (e) {
    console.error('verify-payment error:', e);
    return json({ verified: false, message: 'Payment verification failed.' }, 500);
  }
});
