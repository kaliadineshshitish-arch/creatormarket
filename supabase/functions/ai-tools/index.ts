// ai-tools — content-pack and prompt-creator (Sarvam). Replaces the old Netlify functions.
import { json, handleOptions } from '../_shared/cors.ts';

function env(k: string) { return String(Deno.env.get(k) || '').trim(); }
const MODEL = () => env('SARVAM_MODEL') || 'sarvam-105b';

const PLATFORM_NAMES: Record<string, string> = {
  youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', general: 'any AI tool',
};

async function chat(system: string, user: string, temperature: number): Promise<string> {
  const key = env('SARVAM_API_KEY');
  const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
    body: JSON.stringify({
      model: MODEL(), temperature, max_tokens: 900,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'Sarvam request failed.');
  return data?.choices?.[0]?.message?.content || '';
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
