// Daily sports trends for the SSAC Panel Generator.
//
// Pulls the past week's headlines from ESPN's public RSS feeds and from Google News RSS searches (one per SSAC
// topic), tags each headline with the generator's own topic and sport rules (data/taxonomy.js), scores how
// hot each topic is, and writes data/trends.js. Only headlines, outlets, links and dates are kept: the site
// links out to the articles and never copies their text.
//
// Run: node scripts/fetch-trends.mjs        (no keys needed; a GitHub Action runs it every morning)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'trends.js');
const DAY = 86_400_000;
const NOW = Date.now();
const WEEK = 7 * DAY;

const load = (file) => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
  return ctx.window;
};
const TAX = load(path.join(ROOT, 'data', 'taxonomy.js')).SSAC_TAXONOMY;
const previous = fs.existsSync(OUT) ? load(OUT).SSAC_TRENDS : null;

const ESPN = ['news', 'nfl/news', 'nba/news', 'mlb/news', 'nhl/news', 'ncf/news', 'ncb/news', 'soccer/news', 'wnba/news', 'golf/news', 'tennis/news']
  .map((p) => `https://www.espn.com/espn/rss/${p}`);

// One Google News search per topic, worded the way the news talks about it.
const SEARCHES = {
  strategy: '"sports analytics" OR "advanced stats" OR "analytics department"',
  roster: '"NBA trade" OR "NFL trade" OR "MLB trade" OR "NHL trade" OR "free agency" OR "front office"',
  tech: '"AI in sports" OR "sports technology" OR "tracking data"',
  health: '"sports science" OR "load management" OR "athlete injuries" OR "injury prevention"',
  mind: '"athlete mental health" OR "sports psychology"',
  betting: '"sports betting" OR "prediction markets" sports OR sportsbook',
  media: '"media rights" sports OR "sports streaming" OR "broadcast deal"',
  fans: '"fan experience" OR "new stadium" OR "arena deal"',
  ticketing: '"ticket prices" OR "dynamic pricing" tickets OR "season tickets"',
  sponsorship: '"sponsorship deal" OR "jersey patch" OR "naming rights"',
  ownership: '"team sale" OR "franchise valuation" OR "private equity" sports OR "ownership group"',
  leagues: '"rule change" league OR officiating OR "league commissioner"',
  college: 'NIL OR "college sports" OR "revenue sharing" OR "transfer portal"',
  women: `"women's sports" OR WNBA OR NWSL OR PWHL`,
  impact: '"sports" diversity OR inclusion OR "community program"',
  global: '"World Cup 2026" OR LA28 OR "Olympic Games"',
  youth: '"youth sports" OR "youth soccer" OR "youth baseball" OR "Little League"',
  climate: '"sports" climate OR sustainability OR "extreme heat"',
  athletes: '"players union" OR "collective bargaining" OR "athlete-owned" OR "athlete investor"',
  startups: '"sports tech" startup OR funding OR "venture capital" sports',
  careers: '"named general manager" OR "named president" OR "hired as" sports executive',
};
// Google results must look like sports news (ESPN feeds always are).
const SPORTY = new RegExp([
  String.raw`\b(sports?|athletes?|leagues?|teams?|players?|coach(es)?|season|stadium|arena|fans?|olympics?|olympians?|world cup|nil|ncaa|college football|draft|trade|club|franchise|championship|tournament|playoffs?|wnba|nba|nfl|mlb|nhl|mls|nwsl|pwhl|fifa|uefa|ufc|espn|sportsbooks?|draftkings|fanduel|kalshi|little league|premier league|super bowl|pga|lpga|nascar|f1|formula 1)\b`,
  ...TAX.sports.map((sp) => sp.title.source),
].join('|'), 'i');
const google = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=en-US&gl=US&ceid=US:en`;

const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };

function parse(xml, origin) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    let title = tag(it, 'title');
    let outlet = tag(it, 'source') || (origin === 'espn' ? 'ESPN' : '');
    // Google News titles end with " - Outlet"
    if (origin === 'google' && outlet && title.endsWith(` - ${outlet}`)) title = title.slice(0, -(outlet.length + 3));
    const date = Date.parse(tag(it, 'pubDate'));
    return { title, outlet, url: tag(it, 'link'), date: Number.isFinite(date) ? date : NOW, origin };
  }).filter((h) => h.title && /^https?:\/\//.test(h.url));
}

async function fetchFeed(url, origin) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (SSAC Panel Generator; daily headline digest)' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parse(await res.text(), origin);
  } catch (e) {
    console.warn(`skipped ${url}: ${e.message}`);
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const feeds = [];
for (const url of ESPN) feeds.push({ origin: 'espn', items: await fetchFeed(url, 'espn') });
for (const [id, q] of Object.entries(SEARCHES)) {
  feeds.push({ origin: 'google', topic: id, items: await fetchFeed(google(q), 'google') });
  await sleep(400); // be polite to Google News
}
const ok = feeds.filter((f) => f.items);
if (ok.length < feeds.length / 2) {
  console.error(`Only ${ok.length} of ${feeds.length} feeds answered; keeping yesterday's trends.`);
  process.exit(previous ? 0 : 1);
}

// Tag with the generator's own rules, so news and past panels share one vocabulary.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seen = new Map();
for (const f of ok) {
  for (const h of f.items) {
    if (NOW - h.date > WEEK) continue;
    if (h.origin === 'google' && !SPORTY.test(h.title)) continue;
    if (/live\s*(stream|free)|free on tv|watch .*online|[%*]{2,}|\(\(\(/i.test(h.title)) continue; // stream spam
    const key = norm(h.title);
    const item = seen.get(key) || { ...h, topics: new Set(), sports: new Set() };
    TAX.topics.forEach((t) => { if (t.match.test(h.title)) item.topics.add(t.id); });
    if (f.topic) item.topics.add(f.topic); // the search it came from
    TAX.sports.forEach((sp) => { if (sp.title.test(h.title)) item.sports.add(sp.id); });
    seen.set(key, item);
  }
}
const headlines = [...seen.values()].sort((a, b) => b.date - a.date);

const topics = TAX.topics.map((t) => {
  const list = headlines.filter((h) => h.topics.has(t.id));
  const ruled = headlines.filter((h) => t.match.test(h.title)).length; // same yardstick for every topic
  const fresh = list.filter((h) => NOW - h.date < 2 * DAY).length;
  const outlets = new Set(list.map((h) => h.outlet).filter(Boolean)).size;
  const sportCounts = {};
  list.forEach((h) => h.sports.forEach((s) => { sportCounts[s] = (sportCounts[s] || 0) + 1; }));
  return {
    id: t.id,
    count: list.length,
    fresh,
    outlets,
    // headlines matching the topic's own keyword rules (across every source) count most; then recency and breadth
    ruleMatches: ruled,
    score: 3 * ruled + fresh + Math.round(outlets / 2),
    sports: Object.entries(sportCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id),
    headlines: list.slice(0, 6).map((h) => ({ title: h.title, outlet: h.outlet, url: h.url, date: new Date(h.date).toISOString() })),
  };
}).sort((a, b) => b.score - a.score);

// Keep a short history so the site can say "up from usual" once there are a few days of data.
const today = new Date(NOW).toISOString().slice(0, 10);
const history = (previous?.history || []).filter((d) => d.date !== today).slice(-59);
history.push({ date: today, scores: Object.fromEntries(topics.map((t) => [t.id, t.score])) });

const data = {
  updated: new Date(NOW).toISOString(),
  sources: {
    espn: ok.filter((f) => f.origin === 'espn').length,
    google: ok.filter((f) => f.origin === 'google').length,
    headlines: headlines.length,
  },
  topics,
  history,
};
fs.writeFileSync(OUT, `// Written by scripts/fetch-trends.mjs (daily). Headlines, outlets and links only.\nwindow.SSAC_TRENDS = ${JSON.stringify(data, null, 1)};\n`);
console.log(`${headlines.length} headlines from ${ok.length}/${feeds.length} feeds. Top topics: ${topics.slice(0, 5).map((t) => `${t.id} ${t.score}`).join(', ')}`);
