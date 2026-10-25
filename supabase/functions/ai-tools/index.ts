// ai-tools — content-pack and prompt-creator, powered by Sarvam AI (api.sarvam.ai).
import { json, handleOptions } from '../_shared/cors.ts';

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }
const MODEL = () => env('SARVAM_MODEL') || 'sarvam-105b';

const PLATFORM_NAMES: Record<string, string> = {
  youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', general: 'any AI tool',
};

async function callSarvam(url: string, model: string, extra: Record<string, unknown>, system: string, user: string, temperature: number): Promise<string> {
  const key = env('SARVAM_API_KEY');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
    body: JSON.stringify(Object.assign({
      model, temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }, extra)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || ('Sarvam request failed (HTTP ' + res.status + ').'));
  const ch = (data && data.choices && data.choices[0]) || {};
  return (ch.message && ch.message.content) || '';
}

// sarvam-105b is a reasoning model: it can spend the whole token budget on
// reasoning and return empty content. So we try it with a big budget + low
// reasoning, then fall back to gemma4 (no reasoning at all) — which always
// returns visible content.
async function chat(system: string, user: string, temperature: number): Promise<string> {
  const main = env('SARVAM_MODEL') || 'sarvam-105b';
  const plans: Array<{ url: string; model: string; extra: Record<string, unknown> }> = [
    { url: 'https://api.sarvam.ai/v1/chat/completions', model: main, extra: { max_tokens: 4096, reasoning_effort: 'low' } },
    { url: 'https://api.sarvam.ai/v2/chat/completions', model: 'gemma4', extra: { max_tokens: 2048 } },
    { url: 'https://api.sarvam.ai/v1/chat/completions', model: main, extra: { max_tokens: 8192, reasoning_effort: 'low' } },
  ];
  let lastMsg = '';
  for (const p of plans) {
    for (let i = 0; i < 2; i++) {
      try {
        const c = await callSarvam(p.url, p.model, p.extra, system, user, temperature);
        if (c) return c;
        lastMsg = 'The AI returned an empty reply.';
      } catch (e) {
        lastMsg = (e as Error).message || 'AI request failed.';
        if (/invalid|api key|not configured/i.test(lastMsg)) throw new Error(lastMsg);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(lastMsg || 'The AI could not generate a reply. Please try again.');
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const key = env('SARVAM_API_KEY');
  if (!key) return json({ message: 'AI is not configured yet. Add SARVAM_API_KEY in your Supabase function secrets.' }, 503);

  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || 'content-pack');

    if (mode === 'content-pack') {
      const topic = String(body.topic || '').trim();
      const platform = String(body.platform || 'youtube');
      if (!topic) return json({ message: 'Topic is required.' }, 400);
      const p = PLATFORM_NAMES[platform] || 'social media';
      const system = `You are CreatorMarket, a practical content strategist. Create platform-native content for ${p}. Do not claim to have watched a video unless the user supplied a transcript. Keep it useful, concise and ready to edit. Return plain text with sections: HOOKS (3), TITLE/CAPTION, CTA, HASHTAGS (8-10), VIDEO IDEA. For Facebook prioritise conversational value; Instagram prioritise Reels caption and save/share CTA; TikTok prioritise a fast first-second hook and short caption; YouTube prioritise title, opening hook and Shorts structure.`;
      const content = await chat(system, `Create a ${p} content pack for this topic:\n${topic}`, 0.7);
      return json({ content });
    }

    if (mode === 'prompt-creator') {
      const goal = String(body.goal || '').trim();
      const audience = String(body.audience || '').trim();
      const platform = String(body.platform || 'general');
      const tone = String(body.tone || 'clear and professional');
      if (!goal) return json({ message: 'What you want to create is required.' }, 400);
      const p = PLATFORM_NAMES[platform] || 'any AI tool';
      const system = `You are CreatorMarket Prompt Creator. Turn a user's rough goal into one high-quality, reusable AI prompt for ${p}. Make the prompt specific, actionable, easy to copy, and include role, task, context, constraints, output format, quality checks, and placeholders where useful. Tone preference: ${tone}. Audience: ${audience || 'not specified'}. Return ONLY the finished prompt, no explanation before or after it.`;
      const prompt = await chat(system, `Create the reusable prompt for this goal:\n${goal}`, 0.5);
      return json({ prompt });
    }

    if (mode === 'shorts-pack') {
      const text = String(body.text || '').trim();
      if (!text) return json({ message: 'Send the video transcript or content text for AI generation.' }, 400);
      const system = 'You are CreatorMarket. Create a concise Shorts content pack from the user-provided content. Return 5 hooks, 5 titles, 1 caption and 10 relevant hashtags. Do not claim to have watched any video.';
      const content = await chat(system, `Content:\n${text}`, 0.7);
      return json({ content });
    }

    return json({ message: 'Unknown mode.' }, 400);
  } catch (e) {
    console.error('ai-tools error:', e);
    return json({ message: (e as Error).message || 'Unable to generate content right now.' }, 500);
  }
});
