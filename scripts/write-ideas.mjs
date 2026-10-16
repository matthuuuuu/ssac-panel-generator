// Morning batch of news-based panel ideas for the SSAC Panel Generator, written by Claude through MIT's Parley API.
//
// Runs after scripts/fetch-trends.mjs. For each of the week's hottest SSAC topics it sends Parley that topic's
// headlines and SSAC's past sessions on it, and asks for three original panel ideas. The site adds the lineup
// (real past SSAC speakers) and the archive facts itself, so the model never names people or invents numbers.
// Saves data/ideas.js. Without PARLEY_API_KEY, or if every call fails, yesterday's ideas stay as they are.
//
// Run: PARLEY_API_KEY=... node scripts/write-ideas.mjs   (the GitHub Action passes the key from a repo secret)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'ideas.js');
const PARLEY_URL = 'https://parley.api.mit.edu/v1/messages';
const MODEL = process.env.PARLEY_MODEL || 'claude-sonnet-4-6';
const TOPICS_PER_DAY = 6;
const IDEAS_PER_TOPIC = 3;

const key = process.env.PARLEY_API_KEY;
if (!key) {
  console.log('No PARLEY_API_KEY: skipping the idea batch (yesterday\'s ideas stay).');
  process.exit(0);
}

const load = (file) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(DATA, file), 'utf8'), ctx); return ctx.window; };
const TAX = load('taxonomy.js').SSAC_TAXONOMY;
const TRENDS = load('trends.js').SSAC_TRENDS;
const { panels } = load('panels.js').SSAC_DATA;
const sportIds = new Set(TAX.sports.map((s) => s.id));
const formatIds = new Set(TAX.ideaFormats.map((f) => f.id));

// Same topic tagging the site uses for past sessions.
const norm = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
const core = (title) => norm(title).replace(/\s*[-–—(,]?\s*\b(presented|supported|powered) by\b.*$/i, '');
const pastSessions = (topic) => panels
  .filter((p) => topic.match.test(core(p.title)) || (topic.official || []).some((o) => p.officialTopics.includes(o)))
  .sort((a, b) => b.year - a.year);

// Public copy rules: no em dashes, no emoji.
const clean = (s) => String(s || '').replace(/\s*—\s*/g, ', ').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();

async function askParley(topic, trend) {
  const past = pastSessions(topic);
  const headlines = trend.headlines.slice(0, 6);
  const prompt = [
    `You help the MIT Sloan Sports Analytics Conference (SSAC) plan its next conference program.`,
    `Write ${IDEAS_PER_TOPIC} original session ideas on the topic "${topic.name}" that are timely because of this week's news.`,
    '',
    `This week's headlines on this topic (numbered):`,
    ...headlines.map((h, i) => `${i + 1}. ${h.title} (${h.outlet || 'news'})`),
    '',
    `SSAC's past sessions on this topic: ${past.length} in total, ${past.filter((p) => p.year >= 2024).length} in 2024-2026. The most recent:`,
    ...past.slice(0, 8).map((p) => `- ${p.title} (${p.year})`),
    '',
    `The team's note on why the topic matters: ${topic.why}`,
    '',
    'Rules:',
    '- Each idea must connect to at least one headline above, and must not repeat a past session.',
    '- Ideas are about the business and analytics of sports, for an audience of executives, analysts and students.',
    '- Do not name any person. Do not invent statistics, deals or facts beyond the headlines.',
    '- Title: at most 12 words, specific and lively, no clickbait. Pitch: at most 45 words. Why now: one sentence, at most 30 words, tied to the news.',
    '- Questions: 3 sharp questions a moderator would ask.',
    '- No em dashes, no emoji, American spelling.',
    `- format is one of: ${[...formatIds].join(', ')}. sport is one of: ${[...sportIds].join(', ')}, or "" for cross-sport.`,
    '',
    'Reply with JSON only, no prose, in exactly this shape:',
    '{"ideas":[{"title":"","pitch":"","why":"","questions":["","",""],"format":"panel","sport":"","headlines":[1]}]}',
  ].join('\n');

  const res = await fetch(PARLEY_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Parley status ${res.status}`); // never log the body or the key
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));

  return (json.ideas || []).slice(0, IDEAS_PER_TOPIC).map((idea, i) => {
    const questions = (idea.questions || []).map(clean).filter(Boolean).slice(0, 3);
    const sparked = [...new Set((idea.headlines || []).map(Number))].filter((n) => n >= 1 && n <= headlines.length).map((n) => headlines[n - 1]);
    return {
      id: `n-${TRENDS.updated.slice(0, 10)}-${topic.id}-${i + 1}`,
      topic: topic.id,
      sport: sportIds.has(idea.sport) ? idea.sport : '',
      format: formatIds.has(idea.format) ? idea.format : 'panel',
      title: clean(idea.title),
      pitch: clean(idea.pitch),
      why: clean(idea.why),
      questions,
      headlines: (sparked.length ? sparked : headlines.slice(0, 1)).map((h) => ({ title: h.title, outlet: h.outlet, url: h.url })),
    };
  }).filter((i) => i.title && i.pitch && i.questions.length === 3);
}

const hot = TRENDS.topics.filter((t) => t.headlines.length).slice(0, TOPICS_PER_DAY);
const ideas = [];
for (const trend of hot) {
  const topic = TAX.topics.find((t) => t.id === trend.id);
  try {
    const got = await askParley(topic, trend);
    ideas.push(...got);
    console.log(`${topic.id}: ${got.length} ideas`);
  } catch (e) {
    console.warn(`${topic.id}: skipped (${e.message})`);
  }
}

if (!ideas.length) {
  console.error('No ideas came back; keeping yesterday\'s batch.');
  process.exit(0);
}
const data = { updated: new Date().toISOString(), model: MODEL, source: 'Claude via MIT Parley', newsAsOf: TRENDS.updated, ideas };
fs.writeFileSync(OUT, `// Written by scripts/write-ideas.mjs (daily). Panel ideas drafted by Claude from the week's headlines.\nwindow.SSAC_IDEAS = ${JSON.stringify(data, null, 1)};\n`);
console.log(`${ideas.length} ideas saved from ${hot.length} topics.`);
