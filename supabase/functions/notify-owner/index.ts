// notify-owner — emails the site owner when a new self-declared UPI order needs
// confirmation, with a one-click confirm link. Uses Resend (RESEND_API_KEY).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, handleOptions } from '../_shared/cors.ts';

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }
function round2(n: number) { return Math.round(n * 100) / 100; }

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ sent: false, message: 'Method not allowed' }, 405);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
  const resendKey = env('RESEND_API_KEY');
  const ownerEmail = env('OWNER_EMAIL') || 'kaliadineshshitish@gmail.com';
  const fromEmail = env('RESEND_FROM') || 'CreatorMarket <onboarding@resend.dev>';
  if (!supabaseUrl || !serviceKey) return json({ sent: false, message: 'Supabase server environment variables are missing.' }, 500);
  if (!resendKey) return json({ sent: false, message: 'Email is not configured yet (RESEND_API_KEY missing).' }, 503);

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ sent: false, message: 'Login required.' }, 401);
    const userClient = createClient(supabaseUrl, anonKey || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.id) return json({ sent: false, message: 'Login required.' }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = Number(body.order_id || 0);
    if (!orderId) return json({ sent: false, message: 'Order id is required.' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: rows, error } = await admin.from('orders')
      .select('id,buyer_id,kind,product_id,amount,status,notified_at')
      .eq('id', orderId).limit(1);
    if (error || !rows || !rows.length) return json({ sent: false, message: 'Order not found.' }, 404);
    const order = rows[0];
    if (String(order.buyer_id) !== String(user.id)) return json({ sent: false, message: 'Not your order.' }, 403);
    if (order.notified_at) return json({ sent: true, message: 'Already notified.' });

    let title = order.kind === 'product' ? 'Product purchase' : String(order.kind || 'Order');
    if (order.product_id) {
      const { data: pr } = await admin.from('products').select('title').eq('id', order.product_id).limit(1);
      if (pr && pr[0] && pr[0].title) title = pr[0].title;
    }

    const secret = env('CONFIRM_SECRET') || serviceKey;
    const t = await hmacHex(secret, String(orderId));
    const link = supabaseUrl + '/functions/v1/confirm-payment-link?o=' + orderId + '&t=' + t;
    const amount = round2(Number(order.amount || 0));

    const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">'
      + '<h2 style="margin:0 0 8px">&#9203; New UPI order to confirm</h2>'
      + '<p style="color:#444">A buyer says they paid by UPI. Please check your bank / UPI app, then confirm.</p>'
      + '<table style="border-collapse:collapse;margin:14px 0">'
      + '<tr><td style="padding:4px 12px 4px 0;color:#777">Order</td><td><b>#' + orderId + '</b></td></tr>'
      + '<tr><td style="padding:4px 12px 4px 0;color:#777">Item</td><td>' + title + '</td></tr>'
      + '<tr><td style="padding:4px 12px 4px 0;color:#777">Amount</td><td><b>&#8377;' + amount + '</b></td></tr>'
      + '<tr><td style="padding:4px 12px 4px 0;color:#777">Buyer</td><td>' + (user.email || '') + '</td></tr>'
      + '</table>'
      + '<p><a href="' + link + '" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">&#9989; Confirm payment received</a></p>'
      + '<p style="color:#888;font-size:13px">Or confirm from your dashboard &rarr; Platform earnings &rarr; Pending UPI payments.</p>'
      + '</div>';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [ownerEmail],
        subject: 'CreatorMarket: confirm UPI payment #' + orderId + ' (Rs ' + amount + ')',
        html,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return json({ sent: false, message: (d && d.message) || 'Email could not be sent.' }, 502);
    }

    await admin.from('orders').update({ notified_at: new Date().toISOString() }).eq('id', orderId);
    return json({ sent: true });
  } catch (e) {
    console.error('notify-owner error:', e);
    return json({ sent: false, message: 'Notification failed.' }, 500);
  }
});
