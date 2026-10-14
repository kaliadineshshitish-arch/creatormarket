// thumbnail — returns a YouTube thumbnail URL, or proxies the image bytes for download.
import { corsHeaders, json, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body.url || '');
    if (!/youtube|youtu\.be/i.test(url)) return json({ message: 'Thumbnail lookup currently supports YouTube URLs.' }, 400);

    const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json');
    if (!r.ok) return json({ message: 'Thumbnail unavailable.' }, 400);
    const d = await r.json();

    if (body.download) {
      // Proxy the image bytes so the browser avoids cross-origin issues.
      const img = await fetch(d.thumbnail_url);
      if (!img.ok) return json({ message: 'Thumbnail download failed.' }, 502);
      const buf = await img.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': img.headers.get('content-type') || 'image/jpeg',
          'Content-Disposition': 'attachment; filename="creatormarket-thumbnail.jpg"',
          'Cache-Control': 'no-store',
        },
      });
    }

    return json({ url: d.thumbnail_url, title: d.title, author: d.author_name });
  } catch (e) {
    console.error('thumbnail error:', e);
    return json({ message: 'Thumbnail service error.' }, 500);
  }
});
