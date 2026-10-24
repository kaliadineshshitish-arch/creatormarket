// owner-report — platform-owner only summary of sales, commission earned and
// creator payouts. Uses the service role and an OWNER_EMAIL allowlist.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, handleOptions } from '../_shared/cors.ts';

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }
function round2(n: number) { return Math.round(n * 100) / 100; }

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
  const ownerEmail = env('OWNER_EMAIL').toLowerCase();
  if (!supabaseUrl || !serviceKey) return json({ message: 'Supabase server environment variables are missing.' }, 500);
  if (!ownerEmail) return json({ message: 'OWNER_EMAIL is not configured on the server.' }, 503);

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ message: 'Login required.' }, 401);
    const userClient = createClient(supabaseUrl, anonKey || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.id) return json({ message: 'Login required.' }, 401);
    if (String(user.email || '').toLowerCase() !== ownerEmail) return json({ message: 'Not authorized.' }, 403);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin
      .from('orders')
      .select('id,kind,amount,status,payment_id,commission_amount,creator_payout,product_id,buyer_id,created_at');
    if (error) return json({ message: 'Could not read orders.' }, 500);

    const paid = (data || []).filter((o) => o.status === 'paid');
    const productSales = paid.filter((o) => o.kind === 'product');
    const gross = paid.reduce((s, o) => s + Number(o.amount || 0), 0);
    const commission = paid.reduce((s, o) => s + Number(o.commission_amount || 0), 0);
    const payouts = paid.reduce((s, o) => s + Number(o.creator_payout || 0), 0);

    // Pending self-declared UPI orders the owner should verify and confirm.
    const pending = (data || []).filter((o) => o.status === 'pending');
    const pendingOrders = [];
    for (const o of pending.slice(0, 100)) {
      let title = null;
      let buyerEmail = null;
      if (o.product_id) {
        const { data: pr } = await admin.from('products').select('title').eq('id', o.product_id).limit(1);
        title = pr && pr[0] ? pr[0].title : null;
      }
      try {
        const { data: u } = await admin.auth.admin.getUserById(o.buyer_id);
        buyerEmail = u && u.user ? u.user.email : null;
      } catch (_) { /* email is optional */ }
      pendingOrders.push({
        id: o.id, kind: o.kind, product_id: o.product_id,
        title: title || ('Order #' + o.id),
        amount: Number(o.amount || 0),
        buyer_email: buyerEmail,
        payment_id: o.payment_id || null,
        created_at: o.created_at,
      });
    }

    return json({
      pending_orders: pendingOrders,
      paid_orders: paid.length,
      product_sales: productSales.length,
      gross: round2(gross),
      commission_earned: round2(commission),
      creator_payouts: round2(payouts),
      platform_revenue: round2(commission + paid.filter((o) => o.kind !== 'product').reduce((s, o) => s + Number(o.amount || 0), 0)),
    });
  } catch (e) {
    console.error('owner-report error:', e);
    return json({ message: 'Report failed.' }, 500);
  }
});
