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


    if (mode === 'resume') {
      const lang = String(body.lang || 'english');
      const name = String(body.name || '').trim();
      const role = String(body.role || '').trim();
      if (!name || !role) return json({ message: 'Your name and the job you are applying for are required.' }, 400);

      const LANG_LABEL: Record<string, string> = {
        english: 'English',
        hindi: 'Hindi (Devanagari script)',
        hinglish: 'Hinglish (Hindi written in English letters, the way Indian professionals actually write)',
      };
      const label = LANG_LABEL[lang] || 'English';

      const system = `You are an expert resume writer for the Indian job market, and a strict ATS reviewer.

Write the resume in ${label}. If the language is Hinglish, keep job titles, tools and company names in English but write everything else in natural Hinglish — the way a real Indian professional writes, not a literal translation.

Rules:
- One page. Plain text only, no markdown tables, no emoji.
- Start with the candidate's name, then one line of contact details.
- Then: SUMMARY (2 lines), SKILLS (one line, comma separated), EXPERIENCE (most recent first, 2-4 bullets each starting with a strong verb and containing a number wherever possible), EDUCATION, then anything else relevant.
- Never invent employers, degrees, certifications or numbers the candidate did not provide. If something is missing, leave a clear [ADD: ...] placeholder instead of guessing.
- Do not use first person. No "I".
- Keep bullets under 20 words.

After the resume, output exactly this block:

---
ATS SCORE: <0-100>
MATCHED KEYWORDS: <comma separated, max 12>
MISSING KEYWORDS: <comma separated, max 12, drawn from the job description>
TOP 3 FIXES:
1. <one line>
2. <one line>
3. <one line>
---

Score honestly. A resume with no job description supplied cannot score above 70.`;

      const user = [
        `Name: ${name}`,
        `Email: ${String(body.email || '').trim() || '[ADD: email]'}`,
        `Phone: ${String(body.phone || '').trim() || '[ADD: phone]'}`,
        `City: ${String(body.city || '').trim() || '[ADD: city]'}`,
        `Target role: ${role}`,
        `Experience level: ${String(body.level || 'fresher')}`,
        `Education: ${String(body.education || '').trim() || '[ADD: education]'}`,
        `Work experience: ${String(body.experience || '').trim() || '[ADD: work experience]'}`,
        `Skills: ${String(body.skills || '').trim() || '[ADD: skills]'}`,
        `Job description to match against: ${String(body.jd || '').trim() || 'not supplied'}`,
      ].join('\n');

      const content = await chat(system, user, 0.35);
      return json({ content });
    }


    if (mode === 'business-name') {
      const industry = String(body.industry || '').trim();
      const style = String(body.style || 'modern').trim();
      const keywords = String(body.keywords || '').trim();
      if (!industry) return json({ message: 'What kind of business is it?' }, 400);
      const system = `You are a naming consultant for Indian small businesses. Suggest 10 business names for the industry given.

Rules:
- Names must be easy to say out loud in India and easy to spell over the phone.
- No trademarked or obviously taken names (avoid "Nike", "Zomato" style copies).
- Mix: 4 short and modern, 3 Indian-rooted, 3 descriptive.
- Style preference: ${style}.
- If keywords are supplied, work them in naturally.
- For each name add a one-line tagline.
- Return plain text, one per line: NAME — tagline. Then a final line: "CHECK: <two things to verify before you commit>".
- No emoji, no numbering.`;

      const user = `Industry: ${industry}\nStyle: ${style}\nKeywords: ${keywords || 'none supplied'}`;
      const content = await chat(system, user, 0.8);
      return json({ content });
    }

    if (mode === 'yt-title') {
      const topic = String(body.topic || '').trim();
      const audience = String(body.audience || '').trim();
      const keyword = String(body.keyword || '').trim();
      if (!topic) return json({ message: 'What is the video about?' }, 400);
      const system = `You are a YouTube SEO specialist for Indian channels. For the topic given, produce:

TITLES (5)
Five titles. Each under 60 characters. Front-load the keyword. No clickbait that lies. Vary the angle: one how-to, one number/listicle, one question, one result-driven, one beginner-focused.

DESCRIPTION
150-200 words. First two lines must work as the search snippet. Include the main keyword in the first line. Then what the viewer gets, then a short CTA. No emoji spam.

TAGS
12-15 comma separated tags, lower case.

Return plain text with exactly those three section labels. Topic: ${topic}. Audience: ${audience || 'Indian viewers'}. Main keyword: ${keyword || topic}.`;

      const content = await chat(system, `Write the YouTube pack for: ${topic}`, 0.65);
      return json({ content });
    }

    if (mode === 'ig-bio') {
      const niche = String(body.niche || '').trim();
      const vibe = String(body.vibe || 'friendly').trim();
      const name = String(body.name || '').trim();
      if (!niche) return json({ message: 'What is the account about?' }, 400);
      const system = `You are an Instagram profile writer for Indian creators.

Write 5 Instagram bios for the niche given. Each must be under 150 characters, use at most 2 emoji, and end with a clear call to action (DM, link, or follow).

Vary the style: one short and punchy, one story-style, one list-style, one funny, one professional.

Vibe: ${vibe}. Account name: ${name || 'not supplied'}.

Return plain text, one bio per block separated by a blank line, numbered 1-5. No commentary.`;

      const content = await chat(system, `Niche: ${niche}\nVibe: ${vibe}`, 0.75);
      return json({ content });
    }

    return json({ message: 'Unknown mode.' }, 400);
  } catch (e) {
    console.error('ai-tools error:', e);
    return json({ message: (e as Error).message || 'Unable to generate content right now.' }, 500);
  }
});
