// analyze — YouTube metadata (Data API when configured, oEmbed fallback). Replaces Netlify analyze.js.
import { json, handleOptions } from '../_shared/cors.ts';

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }

function normalizeYoutubeUrl(u: string): string {
  try {
    const x = new URL(u);
    if (x.hostname.includes('youtu.be')) return 'https://www.youtube.com/watch?v=' + x.pathname.slice(1).split('/')[0];
    return u;
  } catch { return u; }
}
function youtubeId(u: string): string | null {
  try {
    const x = new URL(u);
    const h = x.hostname.replace(/^www\./, '');
    if (h === 'youtu.be') return x.pathname.slice(1).split('/')[0];
    if (x.searchParams.get('v')) return x.searchParams.get('v');
    const m = x.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  try {
    const { url } = await req.json().catch(() => ({}));
    if (!url) return json({ message: 'URL required' }, 400);

    const platform = /youtube|youtu\.be/i.test(url) ? 'YouTube'
      : /instagram/i.test(url) ? 'Instagram'
      : /facebook|fb\.watch/i.test(url) ? 'Facebook'
      : /tiktok/i.test(url) ? 'TikTok' : 'Unknown';

    if (platform !== 'YouTube') return json({ platform, message: 'Platform detected. YouTube has full metadata support in this version.' });

    const id = youtubeId(url);
    if (!id) return json({ platform, message: 'Could not detect a valid YouTube video ID.' }, 400);

    const key = env('YOUTUBE_API_KEY');
    if (key) {
      const api = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=' +
        encodeURIComponent(id) + '&key=' + encodeURIComponent(key);
      const r = await fetch(api);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.items?.length) {
        const v = d.items[0];
        return json({
          platform, title: v.snippet?.title || '', channel: v.snippet?.channelTitle || '',
          description: v.snippet?.description || '',
          thumbnail: v.snippet?.thumbnails?.maxres?.url || v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url,
          views: v.statistics?.viewCount || null, duration: v.contentDetails?.duration || null, source: 'youtube-api',
        });
      }
      // An invalid/restricted API key must not kill the basic analyzer — fall through to oEmbed.
    }

    const oe = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(normalizeYoutubeUrl(url)) + '&format=json');
    if (oe.ok) {
      const d = await oe.json();
      return json({
        platform, title: d.title || '', author: d.author_name || '', thumbnail: d.thumbnail_url || '',
        message: 'Basic metadata loaded. Full stats are temporarily unavailable.', source: 'youtube-oembed',
      });
    }
    return json({ platform, message: 'YouTube metadata could not be loaded. Please check the URL and try again.' }, 400);
  } catch (e) {
    console.error('analyze error:', e);
    return json({ message: 'Server error while analyzing the URL.' }, 500);
  }
});
