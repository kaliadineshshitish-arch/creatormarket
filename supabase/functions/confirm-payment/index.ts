// confirm-payment - platform-owner only. Marks a pending (self-declared UPI)
// order as paid, after the owner has verified the money arrived in their bank / UPI app.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, handleOptions } from '../_shared/cors.ts';

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ confirmed: false, message: 'Method not allowed' }, 405);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
  const ownerEmail = (env('OWNER_EMAIL') || 'kaliadineshshitish@gmail.com').toLowerCase();
  if (!supabaseUrl || !serviceKey) return json({ confirmed: false, message: 'Supabase server environment variables are missing.' }, 500);
  if (!ownerEmail) return json({ confirmed: false, message: 'OWNER_EMAIL is not configured on the server.' }, 503);

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ confirmed: false, message: 'Login required.' }, 401);
    const userClient = createClient(supabaseUrl, anonKey || '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.id) return json({ confirmed: false, message: 'Login required.' }, 401);
    if (String(user.email || '').toLowerCase() !== ownerEmail) return json({ confirmed: false, message: 'Not authorized.' }, 403);

    const body = await req.json().catch(() => ({}));
    const orderId = Number(body.order_id || 0);
    if (!orderId) return json({ confirmed: false, message: 'Order id is required.' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: rows, error } = await admin.from('orders').select('id,status').eq('id', orderId).limit(1);
    if (error || !rows || !rows.length) return json({ confirmed: false, message: 'Order not found.' }, 404);
    if (rows[0].status === 'paid') return json({ confirmed: true, message: 'Already confirmed.' });

    const { error: updErr } = await admin
      .from('orders')
      .update({ status: 'paid', payment_id: 'UPI - confirmed by seller' })
      .eq('id', orderId);
    if (updErr) return json({ confirmed: false, message: 'Could not confirm the order.' }, 500);

    return json({ confirmed: true, order_id: orderId });
  } catch (e) {
    console.error('confirm-payment error:', e);
    return json({ confirmed: false, message: 'Confirmation failed.' }, 500);
  }
});
