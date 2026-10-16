/* SSAC Panel Generator. Everything runs in the browser:
   data/panels.js (built by build_data.py) + data/taxonomy.js (editable) -> tagged sessions -> the page. */
(function () {
  "use strict";

  const DATA = window.SSAC_DATA;
  const TAX = window.SSAC_TAXONOMY;
  const { topics, sports } = TAX;
  const speakers = DATA.speakers;
  const panels = DATA.panels;

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  function weighted(items, weightOf) {
    const weights = items.map(weightOf);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  const norm = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

  // ---------- archive search ----------
  // Same rules as the SSAC Topic Finder (dk_site branch), so both sites return the same sessions.
  // Same meaning: spellings and abbreviations that find each other, in both directions.
  const SAME = [
    ["ai", "a.i.", "artificial intelligence"],
    ["nil", "name, image", "name image", "likeness"],
    ["women", "woman", "womens"],
    ["bet", "bets", "betting"],
    ["gambling", "gambl"],
    ["injury", "injuries", "injur"],
    ["college", "colleges", "collegiate"],
    ["university", "universities"],
    ["television", "tv"],
    ["fan", "fans"],
    ["esports", "esport", "e-sports"],
    ["ticket", "tickets", "ticketing"],
    ["owner", "owners", "ownership"],
    ["investment", "investor", "investing", "invest"],
    ["sports science", "sport science"],
  ];
  // Broader -> narrower, one way only: "women" also finds WNBA sessions, but "wnba" finds only WNBA.
  // Expansion chains, so "gambling" -> "bet" -> "sportsbook".
  const BROADER = {
    women: ["female", "girls", "wnba", "nwsl", "pwhl"],
    gambling: ["bet", "poker"],
    bet: ["sportsbook", "wager", "odds"],
    ai: ["machine learning", "generative", "llm", "neural", "deep learning"],
    "machine learning": ["deep learning", "neural"],
    health: ["injury", "medical", "concussion", "sports science", "mental health"],
    injury: ["medical", "concussion"],
    college: ["ncaa", "university"],
    media: ["broadcast", "streaming", "television", "podcast"],
    fan: ["fandom", "spectator", "attendance"],
    tracking: ["optical", "wearable", "sensor", "biometric"],
    esports: ["video game", "gaming"],
    youth: ["kids", "high school", "grassroots"],
    owner: ["private equity"],
    investment: ["private equity"],
    basketball: ["nba", "wnba"],
    football: ["nfl"],
    baseball: ["mlb"],
    hockey: ["nhl", "pwhl"],
    soccer: ["mls", "nwsl", "premier league", "world cup", "fifa"],
  };
  const SAME_OF = {};
  SAME.forEach((g) => g.forEach((w) => { SAME_OF[w] = g; }));
  const PHRASES = [...new Set(SAME.flat().concat(Object.keys(BROADER), Object.values(BROADER).flat()))]
    .filter((p) => p.includes(" ")).sort((a, b) => b.length - a.length);
  const STOP = new Set("the a an of and or in on for to with vs & sport sports about".split(" "));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fold = (s) => norm(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function expand(t) {
    const out = new Set(), todo = [t];
    while (todo.length) {
      const w = todo.pop();
      for (const v of SAME_OF[w] || [w]) {
        if (out.has(v)) continue;
        out.add(v);
        todo.push(...(BROADER[v] || []));
      }
    }
    return [...out];
  }
  // One regex per search word. Every word must match somewhere in the session. Short words (3 letters or
  // fewer) match whole words only ("ai" not "aim"); longer ones match word starts ("injur" -> "injuries").
  function parseQuery(q) {
    q = fold(q).trim();
    const terms = [];
    q = q.replace(/"([^"]+)"/g, (_, p) => { terms.push(p.trim()); return " "; });
    for (const p of PHRASES) q = q.replace(new RegExp(`\\b${reEsc(p)}\\b`, "g"), () => { terms.push(p); return " "; });
    for (let w of q.split(/[\s,;]+/)) {
      w = w.replace(/'s$/, "").replace(/^[^\w]+|[^\w.]+$/g, "");
      if (w && !STOP.has(w)) terms.push(w);
    }
    return [...new Set(terms)].map((t) =>
      new RegExp(expand(t).map((v) => (v.length <= 3 ? `\\b${reEsc(v)}\\b` : `\\b${reEsc(v)}`)).join("|"), "i"));
  }
  const withoutSponsor = (title) => title.replace(/\s*[-–—(,]?\s*\b(presented|supported|powered) by\b.*$/i, "");
  const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
  const yy = (y) => String(y).slice(2);
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const topicById = byId(topics);
  const sportById = byId(sports);
  const ARROW = '<span class="arrow" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 12 12 4M6 4h6v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const avatar = (person, cls) => person.img
    ? `<img class="${cls}" src="${esc(person.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-initials="${esc(initials(person.name))}">`
    : `<span class="${cls} av-initials">${esc(initials(person.name))}</span>`;

  // ---------- tag speakers and sessions ----------
  speakers.forEach((s) => {
    s.sportTags = new Set(sports.filter((sp) => sp.teams.test(s.title) || sp.csv.some((c) => s.sports.includes(c))).map((sp) => sp.id));
    s.media = TAX.mediaRole.test(s.title);
    s.academic = TAX.academicRole.test(s.title);
    s.sessions = [];
  });

  // A session whose title names no sport inherits one when most of its speakers share it.
  function inferSports(people) {
    const tagged = people.filter((s) => s.sportTags.size).length;
    const counts = {};
    people.forEach((s) => s.sportTags.forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
    return Object.keys(counts).filter((id) => counts[id] >= Math.ceil(people.length / 2) && counts[id] >= 0.6 * tagged);
  }

  panels.forEach((p) => {
    const core = norm(withoutSponsor(p.title));
    p.people = p.speakers.map((id) => speakers[id]);
    p.people.forEach((s) => s.sessions.push(p));
    // Luncheons, awards, chess events and competitions don't count toward topic coverage.
    p.special = TAX.specialFormats.includes(p.format) || TAX.specialTitles.test(core);
    // Topics and sports: SSAC's official tags where they map, plus keyword matches on the title.
    p.topics = topics.filter((t) => t.match.test(core) || (t.official || []).some((o) => p.officialTopics.includes(o))).map((t) => t.id);
    p.sports = sports.filter((sp) => sp.title.test(core) || sp.csv.some((c) => p.officialSports.includes(c))).map((sp) => sp.id);
    if (!p.sports.length && !p.special) p.sports = inferSports(p.people);
    // Searchable text: title, SSAC's official tags, description, and speakers' names and job titles.
    p.searchFields = [p.title, [...p.officialTopics, ...p.officialSports].join(" | "), p.description,
      p.people.map((s) => `${s.name} ${s.title}`).join(" | ")].map(fold);
  });

  // ---------- coverage stats ----------
  const years = [...new Set(panels.map((p) => p.year))].sort((a, b) => a - b);
  const latest = years[years.length - 1];
  const recentYears = years.slice(-3);
  const isRecent = (p) => p.year >= recentYears[0];
  const recentLabel = `SSAC${yy(recentYears[0])}–${yy(latest)}`;
  const content = panels.filter((p) => !p.special);

  topics.forEach((t) => {
    t.sessions = content.filter((p) => p.topics.includes(t.id)); // newest first, as built
    t.byYear = Object.fromEntries(years.map((y) => [y, 0]));
    t.sessions.forEach((p) => { t.byYear[p.year]++; });
    t.recent = t.sessions.filter(isRecent).length;
    t.opportunity = t.momentum / (1 + t.recent);
  });
  const maxOpportunity = Math.max(...topics.map((t) => t.opportunity));
  topics.forEach((t) => { t.score = Math.round((100 * t.opportunity) / maxOpportunity); });
  const gapRank = topics.slice().sort((a, b) => b.score - a.score || a.recent - b.recent);

  sports.forEach((sp) => {
    sp.sessions = content.filter((p) => p.sports.includes(sp.id));
    sp.recent = sp.sessions.filter(isRecent).length;
  });
  const crossSport = content.filter((p) => !p.sports.length);

  // ---------- this week's news (data/trends.js, refreshed every morning by scripts/fetch-trends.mjs) ----------
  const TRENDS = window.SSAC_TRENDS && window.SSAC_TRENDS.topics ? window.SSAC_TRENDS : null;
  const trendById = TRENDS ? Object.fromEntries(TRENDS.topics.map((t) => [t.id, t])) : {};
  const maxTrend = TRENDS ? Math.max(1, ...TRENDS.topics.map((t) => t.score)) : 1;
  // Topics in this week's news come up more often in the generator: up to 2.5x for the hottest.
  const newsBoost = (t) => 1 + (1.5 * ((trendById[t.id] || {}).score || 0)) / maxTrend;

  // ---------- generator ----------
  const pairSessions = (topic, sport) => topic.sessions.filter((p) => p.sports.includes(sport.id));
  const personInfo = (s, role) => ({ name: s.name, title: s.title, url: s.url, img: s.img, mit: s.mit, years: s.years, role });

  function suggestLineup(topic, sport, format) {
    const rated = speakers.filter((s) => s.sessions.length).map((s) => {
      const t = s.sessions.filter((p) => p.topics.includes(topic.id)).length;
      const sp = sport ? s.sessions.filter((p) => p.sports.includes(sport.id)).length + (s.sportTags.has(sport.id) ? 1 : 0) : 0;
      const recent = s.years[s.years.length - 1] >= recentYears[0];
      return { s, t, sp, score: 3 * t + 2 * sp + (recent ? 1.5 : 0) + (s.mit ? 0.5 : 0) };
    });
    const pool = rated.filter((r) => r.t || r.sp).sort((a, b) => b.score - a.score);
    const used = new Set();
    const take = (candidates, n, role) => {
      const out = [];
      let options = candidates.filter((r) => !used.has(r.s)).slice(0, 12);
      while (out.length < n && options.length) {
        const r = weighted(options, (x) => x.score + 1);
        used.add(r.s);
        out.push(personInfo(r.s, role));
        options = options.filter((x) => x !== r);
      }
      return out;
    };
    const media = pool.filter((r) => r.s.media);
    const hosts = media.length ? media : rated.filter((r) => r.s.media).sort((a, b) => b.s.years.length - a.s.years.length);
    const doers = pool.filter((r) => !r.s.media);

    if (format.id === "fireside") {
      return [...take(hosts, 1, "Host"), ...take(doers.filter((r) => !r.s.academic), 1, "Featured guest")];
    }
    if (format.id === "research") {
      const presenters = take(doers.filter((r) => r.s.academic), 2, "Presenter");
      return [...presenters, ...take(doers, 2 - presenters.length, "Presenter"), ...take(doers.filter((r) => !r.s.academic), 1, "Respondent")];
    }
    return [...take(hosts, 1, "Moderator"), ...take(doers, 3, "Panelist")];
  }

  // What the archive (and this week's news) says about a topic, for any idea: template or news-written.
  function archiveFacts(topic, sport) {
    const facts = [];
    const last = topic.sessions[0];
    if (!last) {
      facts.push("No past SSAC session has focused on this topic. It would be a first.");
    } else {
      facts.push(`${plural(topic.sessions.length, "past session")} touched this topic, ${topic.recent <= 3 ? `but only ${topic.recent}` : `${topic.recent} of them`} at ${recentLabel}.`);
      facts.push(`Most recent: “${last.title}” (${last.year}).`);
      if (!topic.byYear[latest]) facts.push(`It wasn't on the SSAC${yy(latest)} program at all.`);
    }
    if (sport) {
      const pairs = pairSessions(topic, sport);
      facts.push(pairs.length
        ? `${plural(pairs.length, "session")} ever paired it with ${sport.name} (latest ${pairs[0].year}).`
        : `No past session has paired it with ${sport.name}. Open territory.`);
    }
    facts.push(`Gap score ${topic.score}/100, #${gapRank.indexOf(topic) + 1} of ${topics.length} topics.`);
    const news = trendById[topic.id];
    if (news && news.count) facts.push(`In the news: ${plural(news.count, "headline")} this week on ESPN and Google News, ${news.fresh} in the last two days.`);
    return facts;
  }

  function relatedSessions(topic, sport) {
    return (sport ? pairSessions(topic, sport) : []).concat(topic.sessions)
      .filter((p, i, all) => all.indexOf(p) === i).slice(0, 3)
      .map((p) => ({ title: p.title, year: p.year, url: p.url }));
  }

  // ---------- this morning's news-written ideas (data/ideas.js, drafted by Claude via MIT Parley) ----------
  // Shown first, each once per visit; templates take over when they run out or don't match the picks.
  // The site adds the lineup (real past speakers) and the archive facts, so the model never names people.
  const NEWS_IDEAS = (window.SSAC_IDEAS && window.SSAC_IDEAS.ideas || []).filter((i) => topicById[i.topic]);
  const shownNews = new Set();
  function newsIdea(topicId, sportId) {
    const fits = (i) => (!topicId || i.topic === topicId) &&
      (!sportId || (sportId === "cross" ? !i.sport : i.sport === sportId));
    const fresh = NEWS_IDEAS.filter((i) => fits(i) && !shownNews.has(i.id));
    if (!fresh.length) return null;
    // "Surprise me" mixes in a template now and then; a chosen topic gets its news ideas first.
    if (!topicId && Math.random() < 0.2) return null;
    const pickOne = weighted(fresh, (i) => newsBoost(topicById[i.topic]));
    shownNews.add(pickOne.id);
    const topic = topicById[pickOne.topic];
    const sport = sportById[pickOne.sport] || null;
    const format = TAX.ideaFormats.find((f) => f.id === pickOne.format) || TAX.ideaFormats[0];
    return {
      id: pickOne.id,
      title: pickOne.title,
      pitch: pickOne.pitch,
      format: format.name,
      formatDetail: format.detail,
      topic: topic.name,
      sport: sport ? sport.name : "Cross-sport",
      why: [pickOne.why],
      facts: archiveFacts(topic, sport),
      questions: pickOne.questions,
      lineup: suggestLineup(topic, sport, format),
      openSeat: pick(topic.roles),
      related: relatedSessions(topic, sport),
      headlines: pickOne.headlines,
    };
  }

  function generateIdea(topicId, sportId) {
    const fromNews = newsIdea(topicId, sportId);
    if (fromNews) return fromNews;
    const fixedSport = sportId && sportId !== "cross" ? sportId : "";
    const topic = topicById[topicId] || weighted(topics, (t) => (1 + (6 * t.score) / 100) * newsBoost(t) * (fixedSport && !t.sports.includes(fixedSport) ? 0.15 : 1));
    let sport = sportById[fixedSport] || null;
    if (!sportId && Math.random() < 0.65) {
      sport = weighted(topic.sports.map((id) => sportById[id]), (sp) => sp.momentum / (1 + pairSessions(topic, sp).length));
    }
    const sayOptions = sport ? sport.say.filter((v) => !v.topics || v.topics.includes(topic.id)) : [];
    const say = sport ? pick(sayOptions.length ? sayOptions : sport.say) : TAX.crossSport;
    const fill = (text) => {
      const s = text.replace(/\{(sport|Sport|league|League)\}/g, (_, k) => say[k]);
      return s.charAt(0).toUpperCase() + s.slice(1);
    };
    const format = weighted(TAX.ideaFormats, (f) => f.weight);
    const hook = fill(pick(topic.hooks));
    const sub = fill(pick(topic.subs));
    // A subtitle with its own colon stands alone; a hook ending in "?" needs no colon.
    const title = sub.includes(":") ? sub : `${hook}${hook.endsWith("?") ? "" : ":"} ${sub}`;

    const facts = archiveFacts(topic, sport);
    const related = relatedSessions(topic, sport);

    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title,
      pitch: fill(pick(topic.pitches)),
      format: format.name,
      formatDetail: format.detail,
      topic: topic.name,
      sport: sport ? say.Sport : "Cross-sport",
      why: [topic.why, sport && sport.why].filter(Boolean),
      facts,
      questions: shuffle(topic.questions).slice(0, 3).map(fill),
      lineup: suggestLineup(topic, sport, format),
      openSeat: pick(topic.roles),
      related,
    };
  }

  // ---------- shortlist (saved in this browser only) ----------
  const STORE = "ssac-shortlist-v1";
  let shortlist = [];
  try { shortlist = JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { shortlist = []; }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(shortlist)); } catch (e) { /* private mode: keep in memory */ } };
  const isSaved = (idea) => shortlist.some((i) => i.id === idea.id);

  const ideaText = (i) => [
    i.title,
    `${i.format} · ${i.topic} · ${i.sport}`,
    "",
    i.pitch,
    "",
    `Why now: ${i.why.join(" ")}`,
    `From the archive: ${i.facts.join(" ")}`,
    "",
    ...(i.headlines ? ["Sparked by:", ...i.headlines.map((h) => `- ${h.title} (${h.outlet || "news"}) ${h.url}`), ""] : []),
    "Questions:",
    ...i.questions.map((q) => `- ${q}`),
    "",
    "Possible lineup (past SSAC speakers):",
    ...i.lineup.map((p) => `- ${p.role}: ${p.name}, ${p.title}${p.mit ? " (MIT connection)" : ""}`),
    `- Open seat: ${i.openSeat}`,
  ].join("\n");

  function renderShortlist() {
    $("#sl-count").textContent = shortlist.length;
    $("#nav-sl").textContent = shortlist.length;
    $("#sl-list").innerHTML = shortlist.length
      ? shortlist.map((i) => `<li>
          <button class="sl-open" data-sl-open="${esc(i.id)}">${esc(i.title)}</button>
          <small>${esc(i.format)} · ${esc(i.topic)} · ${esc(i.sport)}</small>
          <button class="sl-x" data-sl-remove="${esc(i.id)}" aria-label="Remove from shortlist">×</button>
        </li>`).join("")
      : `<li class="empty">Save the ideas you like. They'll collect here, ready to copy into an email or doc.</li>`;
    $("#sl-copy").disabled = !shortlist.length;
  }

  // ---------- idea card ----------
  let current = null;
  const careerSpan = (p) => (p.years.length > 1 ? `SSAC ${p.years[0]}–${yy(p.years[p.years.length - 1])} · ${p.years.length} conferences` : `SSAC ${p.years[0]}`);
  const personRow = (p) => `<li>
      ${avatar(p, "av")}
      <div>
        <span class="role">${esc(p.role)}</span>
        <a class="name" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>${p.mit ? `<span class="mit" title="${esc(p.mit)}">MIT</span>` : ""}
        <small class="lu-title" title="${esc(p.title)}">${esc(p.title)}</small>
        <small>${esc(careerSpan(p))}</small>
      </div>
    </li>`;

  function renderIdea(idea) {
    current = idea;
    $("#idea").innerHTML = `
      <div class="idea-meta">
        <span class="chip chip-ink">${esc(idea.format)}</span>
        <span class="chip chip-red">${esc(idea.topic)}</span>
        <span class="chip">${esc(idea.sport)}</span>
        <span class="idea-detail">${esc(idea.formatDetail)}</span>
      </div>
      <h3 class="idea-title">${esc(idea.title)}</h3>
      <p class="idea-pitch">${esc(idea.pitch)}</p>
      <div class="idea-cols">
        <div><h4>Why now</h4>${idea.why.map((w) => `<p>${esc(w)}</p>`).join("")}</div>
        <div><h4>What the archive says</h4>${idea.facts.map((f) => `<p>${esc(f)}</p>`).join("")}</div>
      </div>
      ${idea.headlines ? `<div class="sparked"><h4>Sparked by</h4><ul>${idea.headlines.map((h) => `<li><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}</a><small>${esc(h.outlet || "News")}</small></li>`).join("")}</ul></div>` : ""}
      <h4>Questions to put to the stage</h4>
      <ol class="questions">${idea.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
      <h4>Possible lineup <span class="hint">Past SSAC speakers who've covered similar ground. Hover “MIT” to see the connection.</span></h4>
      <ul class="lineup">
        ${idea.lineup.map(personRow).join("")}
        <li class="open-seat"><span class="av av-open" aria-hidden="true">+</span>
          <div><span class="role">Open seat</span><b>${esc(idea.openSeat.charAt(0).toUpperCase() + idea.openSeat.slice(1))}</b><small>A first-time voice keeps the stage fresh.</small></div>
        </li>
      </ul>
      <h4>Related past sessions</h4>
      <ul class="related">${idea.related.map((r) => `<li><span class="yr">${r.year}</span><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></li>`).join("") || "<li>None yet. This would be a first.</li>"}</ul>
      <div class="idea-actions">
        <button class="btn btn-red" data-action="generate">Generate another ${ARROW}</button>
        <button class="btn-ghost" data-action="save" aria-pressed="${isSaved(idea)}">${isSaved(idea) ? "★ Saved" : "☆ Save to shortlist"}</button>
        <button class="btn-ghost" data-action="copy">Copy idea</button>
      </div>`;
  }

  function newIdea() {
    renderIdea(generateIdea($("#gen-topic").value, $("#gen-sport").value));
  }

  // ---------- what's happening: the week's hottest topics, their headlines, and SSAC's record on each ----------
  const shortDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  function renderNews() {
    if (!TRENDS) return;
    const cards = TRENDS.topics.filter((t) => topicById[t.id] && t.headlines.length).slice(0, 4);
    if (!cards.length) return;
    const updated = new Date(TRENDS.updated);
    $("#news-lede").textContent = `Headlines from ESPN and Google News, matched to SSAC topics. Updated ${shortDate(TRENDS.updated)} at ${updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Topics in the news come up more often in the generator.`;
    $("#news-grid").innerHTML = cards.map((tr, i) => {
      const topic = topicById[tr.id];
      const last = topic.sessions[0];
      const sportNames = tr.sports.map((id) => sportById[id] && sportById[id].name).filter(Boolean).slice(0, 2);
      return `<article class="news-card">
        <div class="news-top"><span class="news-rank">${String(i + 1).padStart(2, "0")}</span><h3>${esc(topic.name)}</h3></div>
        <p class="news-heat">${plural(tr.count, "headline")} this week · ${tr.fresh} in the last 2 days${sportNames.length ? ` · mostly ${esc(sportNames.join(" and ").toLowerCase())}` : ""}</p>
        <ul class="news-heads">${tr.headlines.slice(0, 3).map((h) => `
          <li><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}</a><small>${esc(h.outlet || "News")} · ${shortDate(h.date)}</small></li>`).join("")}
        </ul>
        <p class="news-past">${last
          ? `SSAC has run ${plural(topic.sessions.length, "session")} on this, ${topic.recent} at ${recentLabel}.<span class="news-latest"><b>Latest:</b> “${esc(last.title)}” (${last.year}).</span>`
          : "SSAC has never run a session on this. It would be a first."}</p>
        <div class="news-actions">
          <button class="btn btn-red btn-xs" data-gen-topic="${tr.id}" data-gen-sport="${tr.sports[0] || ""}">Generate a panel ${ARROW}</button>
          <button class="link-btn link-ink" data-filter-topic="${tr.id}">Past sessions</button>
        </div>
      </article>`;
    }).join("");
    $("#news").hidden = false;
    $("#nav-news").hidden = false;
  }

  // ---------- gap analysis ----------
  const dots = (n) => `<span class="dots" aria-label="momentum ${n} of 3">${[1, 2, 3].map((i) => `<i${i <= n ? ' class="on"' : ""}></i>`).join("")}</span>`;

  function renderGaps() {
    if (!document.getElementById("gap-key")) $("#gap-list").insertAdjacentHTML("beforebegin", `<p class="gap-key" id="gap-key"><b>Gap score, 0 to 100:</b> topics with strong momentum and little recent SSAC coverage score highest. 100 is the biggest opportunity.</p>`);
    $("#gap-list").innerHTML = gapRank.slice(0, 8).map((t, i) => `
      <li class="gap">
        <span class="gap-rank">${String(i + 1).padStart(2, "0")}</span>
        <div>
          <div class="gap-head"><h3>${esc(t.name)}</h3><span class="gap-head-r"><button class="btn btn-red btn-xs" data-gen-topic="${t.id}">Generate a panel ${ARROW}</button><span class="gap-score" title="Gap score ${t.score} of 100: momentum heading into SSAC27, against sessions on this topic at ${recentLabel}. Higher means a bigger opportunity."><small>Gap score</small>${t.score}</span></span></div>
          <div class="meter"><i style="width:${t.score}%"></i></div>
          <p class="gap-stats">${dots(t.momentum)} momentum · ${plural(t.recent, "session")} at ${recentLabel} · ${t.sessions[0] ? `last: ${t.sessions[0].year}` : "never covered"}${t.byYear[latest] ? "" : ` · <b>not on the SSAC${yy(latest)} program</b>`}</p>
          <p class="gap-why">${esc(t.why)}</p>
        </div>
      </li>`).join("");

    const rows = sports.map((sp) => ({ id: sp.id, name: sp.name, total: sp.sessions.length, recent: sp.recent }))
      .sort((a, b) => b.total - a.total);
    const maxTotal = Math.max(...rows.map((r) => r.total));
    $("#sport-note").innerHTML = `Sessions per sport: <span class="key all"></span> all-time and <span class="key recent"></span> ${recentLabel}. Click a sport to browse it. Another ${plural(crossSport.length, "session")} (${Math.round((100 * crossSport.length) / content.length)}%) aren't tied to one sport.`;
    $("#sport-bars").innerHTML = rows.map((r) => `
      <li>
        <button class="sb-name" data-filter-sport="${r.id}">${esc(r.name)}</button>
        <div class="sb-track" title="${plural(r.total, "session")} all-time, ${r.recent} at ${recentLabel}"><i class="all" style="width:${(100 * r.total) / maxTotal}%"></i><i class="recent" style="width:${(100 * r.recent) / maxTotal}%"></i></div>
        <span class="sb-num">${r.total}<small> · ${r.recent}</small></span>
      </li>`).join("");

    const maxCell = Math.max(...topics.flatMap((t) => years.map((y) => t.byYear[y])));
    const heat = $("#heat");
    heat.style.setProperty("--cols", years.length);
    heat.innerHTML = `<div class="heat-corner"></div>${years.map((y) => `<div class="heat-year">’${yy(y)}</div>`).join("")}`
      + gapRank.map((t) => `<button class="heat-label" data-filter-topic="${t.id}" title="Browse ${esc(t.name)} sessions">${esc(t.name)}</button>`
        + years.map((y) => {
          const n = t.byYear[y];
          const a = n ? 0.14 + (0.86 * n) / maxCell : 0;
          return `<div class="cell${n ? "" : " zero"}${a > 0.5 ? " dark" : ""}" style="--a:${a.toFixed(2)}" title="${esc(t.name)} · ${y}: ${plural(n, "session")}">${n || ""}</div>`;
        }).join("")).join("");

    $("#method").innerHTML = `<b>How the gap score works.</b> Momentum (1–3, the team's call as of ${esc(TAX.trendsAsOf)}) ÷ (1 + sessions on the topic at ${recentLabel}), scaled so the biggest gap scores 100. Sessions are tagged from their titles with keyword rules in <code>data/taxonomy.js</code>, so counts are approximate. Edit that file to change a topic's momentum, trend note or keywords.`;
  }

  // ---------- archive ----------
  const ARCH = { q: "", year: "", topic: "", sport: "", format: "", sort: "new", limit: 24 };
  const tagChips = (p) => [
    ...p.topics.map((id) => `<button class="tag" data-filter-topic="${id}">${esc(topicById[id].name)}</button>`),
    ...p.sports.map((id) => `<button class="tag tag-sport" data-filter-sport="${id}">${esc(sportById[id].name)}</button>`),
  ].join("");

  // ignoreYear: the year chart counts every filter except the year itself, so picking a year
  // highlights its bar without flattening the others.
  function archiveMatches({ ignoreYear = false } = {}) {
    const terms = parseQuery(ARCH.q);
    const sorts = {
      new: (a, b) => b.year - a.year,
      old: (a, b) => a.year - b.year,
      az: () => 0,
    };
    return panels.filter((p) =>
      (ignoreYear || !ARCH.year || p.year === Number(ARCH.year)) &&
      (!ARCH.topic || p.topics.includes(ARCH.topic)) &&
      (!ARCH.sport || (ARCH.sport === "cross" ? !p.sports.length : p.sports.includes(ARCH.sport))) &&
      (!ARCH.format || p.format === ARCH.format) &&
      terms.every((re) => p.searchFields.some((f) => re.test(f))))
      .sort((a, b) => sorts[ARCH.sort](a, b) || a.title.localeCompare(b.title));
  }

  const card = (p) => `
    <article class="card">
      <div class="card-top">
        <span class="yr">${p.year}</span><span class="fmt">${esc(p.format)}</span>
        ${p.video ? `<a class="watch" href="${esc(p.video)}" target="_blank" rel="noopener">▶ Watch</a>` : ""}
      </div>
      <h3><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></h3>
      ${p.description ? `<p class="desc">${esc(p.description.length > 180 ? `${p.description.slice(0, 180).replace(/\s+\S*$/, "")}…` : p.description)}</p>` : ""}
      <div class="tags">${tagChips(p)}</div>
      <ul class="people">${p.people.map((s) => `<li>${avatar(s, "av av-sm")}<button class="person" data-speaker="${esc(s.name)}" title="${esc(s.title)}">${esc(s.name)}</button></li>`).join("")}</ul>
    </article>`;

  function renderArchive() {
    const list = archiveMatches();
    $("#arch-count").textContent = `${plural(list.length, "session")}${list.length > ARCH.limit ? ` · showing ${ARCH.limit}` : ""}`;
    $("#arch-results").innerHTML = list.slice(0, ARCH.limit).map(card).join("") || `<p class="empty">No sessions match. Try fewer filters.</p>`;
    $("#arch-more").hidden = list.length <= ARCH.limit;
    updateYearChart();
  }

  function setArchive(patch, scroll) {
    Object.assign(ARCH, patch, { limit: 24 });
    $("#q").value = ARCH.q;
    $("#f-year").value = ARCH.year;
    $("#f-topic").value = ARCH.topic;
    $("#f-sport").value = ARCH.sport;
    $("#f-format").value = ARCH.format;
    $("#f-sort").value = ARCH.sort;
    renderArchive();
    if (scroll) $("#archive").scrollIntoView({ behavior: "smooth" });
  }

  // Every bar keeps the same scale (the busiest year), so filtering visibly lowers the bars and clearing
  // the filters raises them again. A faint ghost bar behind each one shows that year's full total.
  const yearTotals = years.map((y) => panels.filter((p) => p.year === y).length);
  const yearMax = Math.max(...yearTotals);
  const barHeight = (n) => `${Math.round((1000 * n) / yearMax) / 10}%`;

  function renderYearChart() {
    $("#year-chart").innerHTML = years.map((y, i) => `
      <button class="ybar" data-year="${y}" aria-pressed="false">
        <span class="ytrack">
          <b class="yghost" style="height:${barHeight(yearTotals[i])}" aria-hidden="true"></b>
          <i style="height:${barHeight(yearTotals[i])}"><span class="ycount">${yearTotals[i]}</span></i>
        </span>
        <span class="ylabel">’${yy(y)}</span>
      </button>`).join("");
  }

  function updateYearChart() {
    const counts = Object.fromEntries(years.map((y) => [y, 0]));
    archiveMatches({ ignoreYear: true }).forEach((p) => { counts[p.year] += 1; });
    const filtered = years.some((y, i) => counts[y] !== yearTotals[i]);
    $("#year-chart").classList.toggle("is-filtered", filtered);
    $("#year-chart").querySelectorAll(".ybar").forEach((bar, i) => {
      const y = years[i];
      const n = counts[y];
      const on = String(y) === String(ARCH.year);
      bar.querySelector("i").style.height = barHeight(n);
      bar.querySelector(".ycount").textContent = n;
      bar.classList.toggle("short", n / yearMax < 0.15); // too short for the dot
      bar.classList.toggle("on", on);
      bar.setAttribute("aria-pressed", String(on));
      bar.title = `${filtered ? `${n} of ${yearTotals[i]}` : n} sessions in ${y}${filtered ? " match" : ""}. ${on ? "Click to show every year." : `Click to show only ${y}.`}`;
    });
  }

  // ---------- hero ----------
  function renderHero() {
    $("#stat-sessions").textContent = panels.length.toLocaleString();
    $("#stat-speakers").textContent = speakers.length.toLocaleString();
    $("#stat-years").textContent = years.length;
    $("#stat-videos").textContent = panels.filter((p) => p.video).length.toLocaleString();
    document.querySelectorAll(".next-name").forEach((el) => { el.textContent = TAX.nextConference.name; });
    $("#data-stamp").textContent = `${plural(panels.length, "session")} (${years[0]}–${latest}) · ${plural(speakers.length, "speaker")} · data built ${DATA.generated}`;
  }

  // ---------- wiring ----------
  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } catch (err) { /* nothing else to try */ }
      area.remove();
    }
    const label = button.innerHTML;
    button.textContent = "Copied!";
    setTimeout(() => { button.innerHTML = label; }, 1400);
  }

  function fillSelects() {
    const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
    const topicsAZ = topics.slice().sort((a, b) => a.name.localeCompare(b.name));
    $("#gen-topic").insertAdjacentHTML("beforeend", topicsAZ.map((t) => opt(t.id, t.name)).join(""));
    $("#gen-sport").insertAdjacentHTML("beforeend", sports.map((s) => opt(s.id, s.name)).join(""));
    $("#f-year").insertAdjacentHTML("beforeend", years.slice().reverse().map((y) => opt(y, y)).join(""));
    $("#f-topic").insertAdjacentHTML("beforeend", topicsAZ.map((t) => opt(t.id, t.name)).join(""));
    $("#f-sport").insertAdjacentHTML("beforeend", sports.map((s) => opt(s.id, s.name)).join(""));
    const formatCounts = {};
    panels.forEach((p) => { formatCounts[p.format] = (formatCounts[p.format] || 0) + 1; });
    const formats = Object.keys(formatCounts).sort((a, b) => formatCounts[b] - formatCounts[a]);
    $("#f-format").insertAdjacentHTML("beforeend", formats.map((f) => opt(f, f)).join(""));
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action],[data-gen-topic],[data-filter-topic],[data-filter-sport],[data-speaker],[data-year],[data-sl-open],[data-sl-remove]");
    if (!el) return;
    const d = el.dataset;
    if (d.action === "generate") newIdea();
    else if (d.action === "hero-generate") { newIdea(); $("#generate").scrollIntoView({ behavior: "smooth" }); }
    else if (d.action === "save") {
      shortlist = isSaved(current) ? shortlist.filter((i) => i.id !== current.id) : shortlist.concat([current]);
      persist(); renderShortlist(); renderIdea(current);
    }
    else if (d.action === "copy") copyText(ideaText(current), el);
    else if (d.action === "copy-shortlist") copyText(shortlist.map(ideaText).join("\n\n----------\n\n"), el);
    else if (d.action === "more") { ARCH.limit += 24; renderArchive(); }
    else if (d.action === "reset") setArchive({ q: "", year: "", topic: "", sport: "", format: "", sort: "new" });
    else if (d.genTopic) {
      $("#gen-topic").value = d.genTopic;
      $("#gen-sport").value = d.genSport || "";
      newIdea();
      $("#generate").scrollIntoView({ behavior: "smooth" });
    }
    else if (d.filterTopic) setArchive({ topic: d.filterTopic }, true);
    else if (d.filterSport) setArchive({ sport: d.filterSport }, true);
    else if (d.speaker) setArchive({ q: d.speaker, year: "", topic: "", sport: "", format: "" }, true);
    else if (d.year) setArchive({ year: ARCH.year === d.year ? "" : d.year }, false);
    else if (d.slOpen) { const idea = shortlist.find((i) => i.id === d.slOpen); if (idea) { renderIdea(idea); $("#idea").scrollIntoView({ behavior: "smooth", block: "start" }); } }
    else if (d.slRemove) {
      shortlist = shortlist.filter((i) => i.id !== d.slRemove);
      persist(); renderShortlist();
      if (current) renderIdea(current);
    }
  });

  // Swap broken headshots for initials.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || !img.dataset.initials) return;
    const span = document.createElement("span");
    span.className = `${img.className} av-initials`;
    span.textContent = img.dataset.initials;
    img.replaceWith(span);
  }, true);

  $("#gen-topic").addEventListener("change", newIdea);
  $("#gen-sport").addEventListener("change", newIdea);
  $("#q").addEventListener("input", (e) => setArchive({ q: e.target.value }));
  [["#f-year", "year"], ["#f-topic", "topic"], ["#f-sport", "sport"], ["#f-format", "format"], ["#f-sort", "sort"]]
    .forEach(([sel, key]) => $(sel).addEventListener("change", (e) => setArchive({ [key]: e.target.value })));

  fillSelects();
  renderHero();
  renderShortlist();
  newIdea();
  renderGaps();
  renderNews();
  renderYearChart();
  renderArchive();
})();
