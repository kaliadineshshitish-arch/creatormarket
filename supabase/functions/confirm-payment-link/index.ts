// confirm-payment-link — one-click confirmation straight from a notification
// (email or chat). No login needed: the link carries an HMAC token.
//
//   GET /functions/v1/confirm-payment-link?o=<order_id>&t=<hmac>
import { createClient } from 'npm:@supabase/supabase-js@2';

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function page(title: string, body: string, ok: boolean) {
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + ' — CreatorMarket</title></head>'
    + '<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0b12;color:#e6e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">'
    + '<div style="max-width:520px;padding:28px;text-align:center">'
    + '<div style="font-size:44px">' + (ok ? '✅' : '⚠️') + '</div>'
    + '<h1 style="font-size:1.35rem;margin:10px 0">' + title + '</h1>'
    + '<p style="color:#98a2b8;line-height:1.6">' + body + '</p>'
    + '<p style="margin-top:22px"><a href="https://creatormarket-nu.vercel.app/" style="color:#8b9bff">Go to CreatorMarket &rarr;</a></p>'
    + '</div></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const orderId = Number(url.searchParams.get('o') || 0);
  const token = String(url.searchParams.get('t') || '');

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const secret = env('CONFIRM_SECRET') || serviceKey;
  if (!supabaseUrl || !serviceKey) return page('Not configured', 'Server environment is missing.', false);
  if (!orderId || !token) return page('Invalid link', 'This confirmation link is incomplete.', false);

  const expect = await hmacHex(secret, String(orderId));
  if (expect !== token) return page('Invalid link', 'This link is not valid. Please confirm from your dashboard instead.', false);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: rows, error } = await admin.from('orders').select('id,status,amount').eq('id', orderId).limit(1);
  if (error || !rows || !rows.length) return page('Order not found', 'We could not find this order.', false);
  if (rows[0].status === 'paid') return page('Already confirmed', 'This payment was already confirmed — the buyer can download.', true);

  const { error: updErr } = await admin
    .from('orders')
    .update({ status: 'paid', payment_id: 'UPI - confirmed via link' })
    .eq('id', orderId);
  if (updErr) return page('Could not confirm', 'Please try again, or confirm from your dashboard.', false);

  return page('Payment confirmed', 'Order #' + orderId + ' is now marked paid. The buyer can download their file.', true);
});
