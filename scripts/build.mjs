// Regenerates the live panels of the profile README.
// Runs in GitHub Actions (.github/workflows/update-profile.yml). Node 20+, no dependencies.
import { readFileSync, writeFileSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'muftiarifudintaqy';
const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;
const MOCK = !!process.env.MOCK;
const TZ = 'Asia/Jakarta';

const C = { bg: '#050507', card: '#0D0D12', line: '#24242C', ink: '#F5F5F7', sub: '#8E8E99', dim: '#55555F' };
const MONO = "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Helvetica,Arial,sans-serif";
const STOPS = [[94, 92, 230], [191, 90, 242], [255, 100, 130]]; // indigo -> violet -> pink

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = n => Number(n).toLocaleString('en-US');
const day = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const now = new Date();
const stamp = now.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).replace(',', '') + ' WIB';

function mix(t) { // 0..1 along the brand gradient
  const seg = t < 0.5 ? 0 : 1, k = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = STOPS[seg], b = STOPS[seg + 1];
  return a.map((v, i) => Math.round(v + (b[i] - v) * k));
}
const rgb = (c, f = 1) => `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')})`;

function shell(w, h, inner, defs = '', style = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#5E5CE6"/><stop offset=".5" stop-color="#BF5AF2"/><stop offset="1" stop-color="#FF6482"/></linearGradient>
<clipPath id="outer"><rect width="${w}" height="${h}" rx="18"/></clipPath>${defs}
<style>text{font-family:${SANS}}.mono{font-family:${MONO}}${style}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style></defs>
<g clip-path="url(#outer)"><rect width="${w}" height="${h}" fill="${C.bg}"/>${inner}</g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="17.5" fill="none" stroke="${C.line}"/></svg>`;
}
function windowBar(x, y, w, h, title, right = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.card}" stroke="${C.line}"/>
<circle cx="${x + 18}" cy="${y + 17}" r="4" fill="#FF5F57"/><circle cx="${x + 31}" cy="${y + 17}" r="4" fill="#FEBC2E"/><circle cx="${x + 44}" cy="${y + 17}" r="4" fill="#28C840"/>
<text x="${x + 60}" y="${y + 21}" class="mono" font-size="11" fill="${C.sub}">${title}</text>
<text x="${x + w - 16}" y="${y + 21}" class="mono" font-size="11" fill="${C.sub}" text-anchor="end">${right}</text>
<line x1="${x}" y1="${y + 33}" x2="${x + w}" y2="${y + 33}" stroke="${C.line}"/>`;
}

// ---------------- data ----------------
async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-build' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (!res.ok || j.errors) throw new Error('GitHub API: ' + JSON.stringify(j.errors || j));
  return j.data;
}
async function contributions() {
  if (MOCK) {
    const days = [];
    for (let i = 370; i >= 0; i--) {
      const d = new Date(now); d.setUTCDate(d.getUTCDate() - i);
      const r = Math.random(); const busy = i < 80 ? 70 : 16; if (process.env.MOCK === 'sparse') { days.push({ date: d.toISOString().slice(0, 10), count: (i < 40 ? r < 0.7 : r < 0.05) ? 1 + Math.floor(r * 20) : 0 }); continue; }
      days.push({ date: d.toISOString().slice(0, 10), count: r < 0.5 ? 0 : Math.floor(r * r * busy) });
    }
    return { days: days.slice(-371), allTime: 3120, since: '2024-07-01' };
  }
  if (!TOKEN) throw new Error('GITHUB_TOKEN is missing');
  const d = await gql(`query($l:String!){user(login:$l){createdAt contributionsCollection{contributionYears contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`, { l: LOGIN });
  const u = d.user;
  const days = u.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays.map(x => ({ date: x.date, count: x.contributionCount })));
  let allTime = 0;
  for (const y of u.contributionsCollection.contributionYears) {
    const r = await gql(`query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){contributionCalendar{totalContributions}}}}`,
      { l: LOGIN, f: `${y}-01-01T00:00:00Z`, t: `${y}-12-31T23:59:59Z` });
    allTime += r.user.contributionsCollection.contributionCalendar.totalContributions;
  }
  const first = Math.min(...u.contributionsCollection.contributionYears);
  return { days, allTime, since: u.createdAt.slice(0, 10) > `${first}-01-01` ? u.createdAt.slice(0, 10) : `${first}-01-01` };
}
function summarize(days) {
  const year = days.reduce((a, d) => a + d.count, 0);
  const active = days.filter(d => d.count > 0).length;
  let best = days[0]; for (const d of days) if (d.count > best.count) best = d;
  let longest = 0, run = 0, s = null, ls = null, le = null;
  for (const d of days) { if (d.count > 0) { if (!run) s = d.date; run++; if (run > longest) { longest = run; ls = s; le = d.date; } } else run = 0; }
  let i = days.length - 1; if (days[i]?.count === 0) i--;
  let current = 0; while (i >= 0 && days[i].count > 0) { current++; i--; }
  return { year, active, best, longest, ls, le, current };
}

// ---------------- stats tiles ----------------
function cube(x, y, col) {
  const c = mix(col);
  return `<g transform="translate(${x} ${y})"><g class="fl"><polygon points="0,-7 8,-3 0,1 -8,-3" fill="${rgb(c, 1.15)}"/><polygon points="-8,-3 0,1 0,10 -8,6" fill="${rgb(c, 0.7)}"/><polygon points="8,-3 0,1 0,10 8,6" fill="${rgb(c, 0.9)}"/></g></g>`;
}
function statsSvg(t, s) {
  const tiles = [
    ['TOTAL', fmt(t.allTime), `since ${new Date(t.since + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`, 0],
    ['LAST 12 MONTHS', fmt(s.year), `${s.active} active days`, 0.25],
    ['CURRENT STREAK', `${s.current}`, s.current ? `day${s.current === 1 ? '' : 's'} in a row` : 'start one today', 0.5],
    ['LONGEST STREAK', `${s.longest}`, s.ls ? `${day(s.ls)} – ${day(s.le)}` : 'days', 0.75],
    ['BEST DAY', fmt(s.best.count), day(s.best.date), 1],
  ];
  const W = 900, H = 118, gap = 12, tw = (W - 48 - gap * 4) / 5;
  const inner = tiles.map(([k, v, sub, col], i) => {
    const x = 24 + i * (tw + gap), c = mix(col);
    return `<g class="t" style="animation-delay:${(i * 0.08).toFixed(2)}s">
<rect x="${x}" y="22" width="${tw}" height="76" rx="12" fill="${C.card}" stroke="${C.line}"/>
<rect x="${x + 12}" y="34" width="2.5" height="11" rx="1" fill="${rgb(c)}"/>
<text x="${x + 20}" y="43" class="mono" font-size="9" letter-spacing="1.6" fill="${C.sub}">${k}</text>
<text x="${x + 12}" y="74" font-size="26" font-weight="700" letter-spacing="-.8" fill="${C.ink}">${v}</text>
<text x="${x + 12}" y="90" class="mono" font-size="9.5" fill="${C.dim}">${esc(sub)}</text>
${cube(x + tw - 22, 66, col)}</g>`;
  }).join('');
  return shell(W, H, inner, '', '.t{animation:t .7s cubic-bezier(.2,.8,.2,1) backwards}.fl{animation:fl 3s ease-in-out infinite}@keyframes fl{50%{transform:translateY(-3px)}}@keyframes t{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}');
}

// ---------------- isometric skyline ----------------
function skylineSvg(days, s) {
  const W = 900, H = 450;
  const weeks = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const cols = weeks.slice(-53);
  const max = Math.max(1, ...days.map(d => d.count));
  const VW = [11.4, 2.7], VD = [-8.6, 5.4]; // week axis, weekday axis
  const ox = 140, oy = 196;
  const P = (w, d, z = 0) => [ox + w * VW[0] + d * VD[0], oy + w * VW[1] + d * VD[1] - z];
  const pts = a => a.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  const nW = cols.length, nD = 7;

  // base slab
  const th = 12;
  const base = `
<polygon points="${pts([P(0, 0), P(nW, 0), P(nW, nD), P(0, nD)])}" fill="#101017" stroke="${C.line}"/>
<polygon points="${pts([P(0, nD), P(nW, nD), P(nW, nD, -th), P(0, nD, -th)])}" fill="url(#edge)"/>
<polygon points="${pts([P(nW, 0), P(nW, nD), P(nW, nD, -th), P(nW, 0, -th)])}" fill="#0B0B10"/>`;

  // cells, painter order w + d ascending
  const cells = [];
  cols.forEach((wk, w) => wk.forEach((d, dd) => cells.push({ w, d: dd, ...d })));
  cells.sort((a, b) => (a.w + a.d) - (b.w + b.d));
  let bars = '', bestPos = null;
  for (const c of cells) {
    const q = c.count / max, h = c.count ? 4 + Math.pow(q, 0.62) * 78 : 0;
    const inset = 0.12, w0 = c.w + inset, w1 = c.w + 1 - inset, d0 = c.d + inset, d1 = c.d + 1 - inset;
    if (!c.count) { bars += `<polygon points="${pts([P(w0, d0, 0.5), P(w1, d0, 0.5), P(w1, d1, 0.5), P(w0, d1, 0.5)])}" fill="#191921"/>`; continue; }
    const col = mix(Math.min(1, Math.pow(q, 0.7)));
    const delay = (c.w * 0.018).toFixed(3);
    bars += `<g class="b" style="animation-delay:${delay}s"><title>${c.date}: ${c.count} contributions</title>
<polygon points="${pts([P(w0, d1), P(w1, d1), P(w1, d1, h), P(w0, d1, h)])}" fill="${rgb(col, 0.55)}"/>
<polygon points="${pts([P(w1, d0), P(w1, d1), P(w1, d1, h), P(w1, d0, h)])}" fill="${rgb(col, 0.78)}"/>
<polygon points="${pts([P(w0, d0, h), P(w1, d0, h), P(w1, d1, h), P(w0, d1, h)])}" fill="${rgb(col, 1.12)}"/></g>`;
    if (c.date === s.best.date) bestPos = P(c.w + 0.5, c.d + 0.5, h);
  }

  // month labels along the front edge
  let months = '', last = '', lastW = -9;
  cols.forEach((wk, w) => {
    const m = new Date(wk[0].date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
    if (m !== last) { if (w - lastW >= 3 && w < nW - 1) { const [x, y] = P(w, nD, -th - 16); months += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="mono" font-size="9" letter-spacing="1" fill="${C.sub}">${m}</text>`; lastW = w; } last = m; }
  });
  const dayLbl = ['MON', 'WED', 'FRI'].map((t, i) => { const [x, y] = P(0, 1 + i * 2 + 0.6); return `<text x="${(x - 14).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="mono" font-size="8.5" fill="${C.dim}" text-anchor="end">${t}</text>`; }).join('');

  let callout = '';
  if (bestPos) {
    const [bx, by] = bestPos, ty = Math.max(150, by - 46), label = `best day · ${s.best.count} on ${day(s.best.date)}`;
    const lw = label.length * 6.1 + 18;
    callout = `<g class="c"><line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${(ty + 8).toFixed(1)}" stroke="#FEBC2E" stroke-dasharray="2 2"/>
<rect x="${(bx - lw / 2).toFixed(1)}" y="${(ty - 12).toFixed(1)}" width="${lw.toFixed(1)}" height="20" rx="5" fill="#16161C" stroke="#FEBC2E"/>
<text x="${bx.toFixed(1)}" y="${(ty + 2).toFixed(1)}" class="mono" font-size="10" fill="#FEBC2E" text-anchor="middle">${esc(label)}</text></g>`;
  }
  // background stars, deterministic
  let stars = ''; let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 46; i++) stars += `<circle cx="${(40 + rnd() * 820).toFixed(0)}" cy="${(70 + rnd() * 130).toFixed(0)}" r="${(0.6 + rnd() * 0.9).toFixed(1)}" fill="#fff" opacity="${(0.15 + rnd() * 0.45).toFixed(2)}" class="s" style="animation-delay:${(rnd() * 3).toFixed(1)}s"/>`;
  const legend = [0, 0.33, 0.66, 1].map((t, i) => `<rect x="${740 + i * 16}" y="${82}" width="11" height="11" rx="2.5" fill="${rgb(mix(t))}"/>`).join('');

  const inner = `${windowBar(24, 24, 852, H - 48, '~/contributions --last 12mo --render iso', `synced ${stamp}`)}
${stars}
<text x="48" y="96" class="mono" font-size="22" font-weight="700" letter-spacing="3" fill="${C.ink}">CONTRIBUTION SKYLINE</text>
<text x="48" y="116" class="mono" font-size="10" fill="${C.sub}">${fmt(s.year)} contributions · ${s.active} active days · taller tower = busier day</text>
<text x="720" y="91" class="mono" font-size="9" fill="${C.dim}" text-anchor="end">less</text>${legend}<text x="808" y="91" class="mono" font-size="9" fill="${C.dim}">more</text>
${base}${bars}${months}${callout}
<rect class="sweep2" x="-200" y="60" width="160" height="${H - 120}" fill="url(#sw)" opacity=".5"/>
<text x="48" y="${H - 44}" class="mono" font-size="9" letter-spacing="1" fill="${C.dim}">USER <tspan fill="${C.sub}">${LOGIN}</tspan>    GRID <tspan fill="${C.sub}">53w × 7d</tspan></text>`;
  return shell(W, H, inner,
    `<linearGradient id="sw" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#BF5AF2" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="edge" x1="0" x2="1"><stop offset="0" stop-color="#2A1F4D"/><stop offset=".5" stop-color="#3A1F4A"/><stop offset="1" stop-color="#4A1F33"/></linearGradient>`,
    `@keyframes b{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.c{animation:b .6s .2s backwards}.sweep2{animation:sw2 7s ease-in-out infinite}@keyframes sw2{0%{transform:translateX(0)}60%,100%{transform:translateX(1100px)}}.s{animation:tw 3s ease-in-out infinite}@keyframes tw{50%{opacity:.08}}`);
}

// ---------------- dev news ----------------
const FEEDS = [
  ['HN', 'https://hnrss.org/frontpage?count=12'],
  ['DEV', 'https://dev.to/feed'],
  ['LARAVEL', 'https://feed.laravel-news.com/'],
  ['GITHUB', 'https://github.blog/feed/'],
  ['NODE.JS', 'https://nodejs.org/en/feed/blog.xml'],
  ['FREECODECAMP', 'https://www.freecodecamp.org/news/rss/'],
];
const pick = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? m[1] : ''; };
const clean = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;lt;/g, '<').replace(/&amp;gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim();
async function news() {
  if (MOCK) return [{ src: 'HN', title: 'Example story', link: 'https://news.ycombinator.com', date: now, desc: 'Preview item.' }];
  const all = [];
  for (const [src, url] of FEEDS) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 profile-build' }, signal: AbortSignal.timeout(15000) });
      const xml = await r.text();
      const items = xml.split(/<item[\s>]|<entry[\s>]/i).slice(1, 4);
      for (const it of items) {
        const title = clean(pick(it, 'title'));
        let link = clean(pick(it, 'link')); if (!link) { const m = it.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ''; }
        const date = new Date(clean(pick(it, 'pubDate') || pick(it, 'published') || pick(it, 'updated')) || now);
        let desc = clean(pick(it, 'description') || pick(it, 'summary') || pick(it, 'content'));
        if (/^(Article URL|Comments URL)/i.test(desc) || src === 'HN') desc = '';
        if (desc.length > 150) desc = desc.slice(0, 147).replace(/\s+\S*$/, '') + '…';
        if (title && link.startsWith('http')) all.push({ src, title, link, date, desc });
      }
    } catch (e) { console.warn('feed failed', src, e.message); }
  }
  // 2 per source first, newest first, 10 total
  const per = {}; const out = [];
  for (const it of all.sort((a, b) => b.date - a.date)) { per[it.src] = (per[it.src] || 0) + 1; if (per[it.src] <= 2) out.push(it); }
  return out.slice(0, 6);
}
const ago = d => { const m = Math.max(1, Math.round((now - d) / 60000)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
function newsHeaderSvg(n) {
  return shell(900, 104, `${windowBar(24, 20, 852, 64, '~/feed --topic programming', `refreshed ${stamp}`)}
<text x="48" y="77" class="mono" font-size="11" fill="${C.sub}"><tspan fill="${C.ink}" font-weight="700" font-size="13" letter-spacing="2">DEV NEWS</tspan>   ${n} stories from Hacker News, dev.to, Laravel News, GitHub, Node.js and freeCodeCamp</text>
<g transform="translate(838 62)"><circle r="3" fill="#FF6482"/><path d="M-3 -10a13 13 0 0 1 13 13M-3 -16a19 19 0 0 1 19 19" stroke="#FF6482" stroke-width="2" fill="none" stroke-linecap="round"/></g>`);
}
function newsMarkdown(items) {
  const cell = it => `<td width="50%" valign="top"><sub><code>${esc(it.src)}</code> ${ago(it.date)}</sub><br><a href="${esc(it.link)}"><b>${esc(it.title)}</b></a>${it.desc ? `<br><sub>${esc(it.desc)}</sub>` : ''}</td>`;
  let rows = '';
  for (let i = 0; i < items.length; i += 2) rows += `<tr>${cell(items[i])}${items[i + 1] ? cell(items[i + 1]) : '<td></td>'}</tr>\n`;
  return `<table>\n${rows}</table>`;
}


// ---------------- snake game: grows one block per commit-day, crashes, restarts ----------------
function simulateSnake(cols) {
  const C = cols.length, R = 7, key = (x, y) => x + ',' + y;
  const food = new Map();
  cols.forEach((wk, x) => wk.forEach((d, y) => { if (d.count > 0) food.set(key(x, y), d.date); }));
  // spawn from a random edge (seeded by date so it changes every day, not every run)
  let seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const side = Math.floor(rnd() * 4);
  let head, dir;
  if (side === 0) { head = [0, Math.floor(rnd() * R)]; dir = [1, 0]; }
  else if (side === 1) { head = [C - 1, Math.floor(rnd() * R)]; dir = [-1, 0]; }
  else if (side === 2) { head = [Math.floor(rnd() * C), 0]; dir = [0, 1]; }
  else { head = [Math.floor(rnd() * C), R - 1]; dir = [0, -1]; }
  const INIT = 3;
  // entry: start outside the board so the snake slides in from the wall
  const entry = [];
  for (let k = INIT + 1; k >= 1; k--) entry.push([head[0] - dir[0] * k, head[1] - dir[1] * k]);
  const path = [...entry, head.slice()];
  let body = [head.slice(), ...entry.slice().reverse().slice(0, INIT - 1)];
  const eats = []; // {tick, cell, len}
  let len = INIT;
  const inside = (x, y) => x >= 0 && y >= 0 && x < C && y < R;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const blocked = (b) => new Set(b.slice(0, -1).map(p => key(p[0], p[1])));
  function bfs(start, b) {
    const block = blocked(b), prev = new Map([[key(...start), null]]), q = [start];
    while (q.length) {
      const c = q.shift();
      if (food.has(key(...c)) && !(c[0] === start[0] && c[1] === start[1])) {
        const route = []; let k = key(...c);
        while (prev.get(k)) { route.push(k.split(',').map(Number)); k = prev.get(k); }
        return route.reverse();
      }
      for (const d of dirs) {
        const n = [c[0] + d[0], c[1] + d[1]], nk = key(...n);
        if (!inside(...n) || block.has(nk) || prev.has(nk)) continue;
        prev.set(nk, key(...c)); q.push(n);
      }
    }
    return null;
  }
  function space(start, b) { // reachable area, used when no food is reachable
    const block = blocked(b), seen = new Set([key(...start)]), q = [start];
    while (q.length) { const c = q.shift(); for (const d of dirs) { const n = [c[0] + d[0], c[1] + d[1]], nk = key(...n); if (inside(...n) && !block.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(n); } } }
    return seen.size;
  }
  // path from a to b avoiding the body (the tail cell is free because it moves away)
  function route(a, b, bodyNow, goalSet) {
    const block = new Set(bodyNow.slice(0, -1).map(p => key(p[0], p[1])));
    const prev = new Map([[key(...a), null]]), q = [a];
    while (q.length) {
      const c = q.shift(), ck = key(...c);
      if ((goalSet ? goalSet.has(ck) : ck === key(...b)) && ck !== key(...a)) {
        const r = []; let k = ck; while (prev.get(k)) { r.push(k.split(',').map(Number)); k = prev.get(k); } return r.reverse();
      }
      for (const d of dirs) { const n = [c[0] + d[0], c[1] + d[1]], nk = key(...n); if (!inside(...n) || block.has(nk) || prev.has(nk)) continue; prev.set(nk, ck); q.push(n); }
    }
    return null;
  }
  // play the route virtually and check the snake can still reach its own tail afterwards
  function safeAfter(r, bodyNow, lenNow) {
    let b = bodyNow.map(p => p.slice()), l = lenNow;
    for (const st of r) { b.unshift(st.slice()); if (food.has(key(...st))) l++; while (b.length > l) b.pop(); }
    if (b.length < 4) return true;
    return !!route(b[0], b[b.length - 1], b, null);
  }
  function moveTo(step) {
    dir = [step[0] - head[0], step[1] - head[1]];
    head = step; path.push(head.slice()); body.unshift(head.slice());
    const k = key(...head);
    if (food.has(k)) { len++; eats.push({ tick: path.length - 1, date: food.get(k), len }); food.delete(k); }
    while (body.length > len) body.pop();
  }
  let guard = 0;
  while (food.size && guard++ < 6000) {
    const foodSet = new Set(food.keys());
    const r = route(head, null, body, foodSet);
    if (r && safeAfter(r, body, len)) { moveTo(r[0]); continue; }
    // not safe: chase the tail (longest-looking safe move) until a safe food route opens up
    const opts = dirs.map(d => [head[0] + d[0], head[1] + d[1]])
      .filter(n => inside(...n) && !new Set(body.slice(0, -1).map(p => key(...p))).has(key(...n)));
    if (!opts.length) break;
    const scored = opts.map(n => {
      const b2 = [n, ...body]; if (!food.has(key(...n))) b2.pop();
      const tail = b2[b2.length - 1], toTail = route(n, tail, b2, null);
      return { n, ok: !!toTail, dist: toTail ? toTail.length : -1, sp: space(n, b2) };
    }).sort((p, q) => (q.ok - p.ok) || (q.dist - p.dist) || (q.sp - p.sp));
    moveTo(scored[0].n);
  }
  const victory = food.size === 0;
  if (!victory) { // stuck: keep going straight until the snake hits the wall
    while (inside(head[0] + dir[0], head[1] + dir[1])) { head = [head[0] + dir[0], head[1] + dir[1]]; path.push(head.slice()); }
    path.push([head[0] + dir[0] * 0.45, head[1] + dir[1] * 0.45]);
  }
  return { path, eats, init: INIT, finalLen: len, victory, total: eats.length + food.size };
}

function pulseSvg(days, s) {
  const W = 900, H = 262, cell = 11, gap = 3, step = cell + gap;
  const weeks = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const cols = weeks.slice(-53);
  const max = Math.max(1, ...days.map(d => d.count));
  const gw = cols.length * step - gap, gh = 7 * step - gap, gx = Math.round((W - gw) / 2), gy = 100;
  const P = (x, y) => [gx + x * step + cell / 2, gy + y * step + cell / 2];

  const g = simulateSnake(cols);
  const TICK = 0.11, N = g.path.length - 1, RUN = N * TICK, HOLD = g.victory ? 4.2 : 1.6, D = +(RUN + HOLD).toFixed(3);
  const END = D - 0.35; // fade out just before the loop restarts
  const pct = t => (t / D * 100).toFixed(3);
  const pathD = 'M' + g.path.map(p => P(...p).map(v => v.toFixed(1)).join(' ')).join(' L');

  // board + food
  let cells = '';
  const eatTick = Object.fromEntries(g.eats.map(e => [e.date, e.tick]));
  cols.forEach((wk, x) => wk.forEach((d, y) => {
    const [px, py] = [gx + x * step, gy + y * step];
    cells += `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" rx="3" fill="#15151C"/>`;
    if (d.count) {
      const q = d.count / max, col = rgb(mix(Math.min(1, Math.pow(q, 0.6))));
      const t = (eatTick[d.date] ?? N) * TICK;
      cells += `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" rx="3" fill="${col}" class="f" style="animation-name:f${x}_${y}"><title>${d.date}: ${d.count}</title></rect>`
        + `<style>@keyframes f${x}_${y}{0%,${pct(Math.max(0, t - 0.01))}%{opacity:1;transform:none}${pct(t + 0.12)}%,98%{opacity:0;transform:scale(.2)}100%{opacity:1;transform:none}}</style>`;
    }
  }));

  // body segments: segment i trails the head by i ticks, appears when the snake has grown to i+1
  const maxLen = g.finalLen;
  const appear = i => (i < g.init ? 0 : g.eats[i - g.init].tick * TICK);
  let segs = '', segStyle = '';
  for (let i = maxLen - 1; i >= 1; i--) {
    const t0 = appear(i);
    const tailT = Math.max(0, 1 - i / Math.max(8, maxLen));
    const r = 6.1 * (0.74 + 0.26 * tailT);
    const c = mix(Math.min(1, i / Math.max(10, maxLen)));
    const f = Math.max(0, (N - i) / N).toFixed(5);
    segs += `<g class="s s${i}"><g><animateMotion dur="${D}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="0;0;${f};${f}" keyTimes="0;${(i * TICK / D).toFixed(5)};${(RUN / D).toFixed(5)};1"><mpath href="#route" xlink:href="#route"/></animateMotion>
<ellipse rx="${(r * 1.3).toFixed(2)}" ry="${r.toFixed(2)}" fill="${rgb(c)}" stroke="${rgb(c, 0.55)}" stroke-width=".8"/><path d="M${(-r * .55).toFixed(1)} ${(-r * .55).toFixed(1)}q${(r * .45).toFixed(1)} ${(r * .45).toFixed(1)} 0 ${(r * 1.1).toFixed(1)}M${(r * .15).toFixed(1)} ${(-r * .6).toFixed(1)}q${(r * .45).toFixed(1)} ${(r * .5).toFixed(1)} 0 ${(r * 1.2).toFixed(1)}" stroke="${rgb(c, 0.62)}" stroke-width="1" fill="none"/><ellipse cx="0" cy="${(-r * .38).toFixed(1)}" rx="${(r * .6).toFixed(1)}" ry="${(r * .22).toFixed(1)}" fill="#fff" opacity=".22"/></g></g>`;
    segStyle += `.s${i}{animation:v${i} ${D}s linear infinite}@keyframes v${i}{0%,${pct(Math.max(0, t0 - 0.001))}%{opacity:0}${pct(t0)}%,${pct(g.victory ? END - 0.3 : RUN + 0.5)}%{opacity:1}${pct(g.victory ? END : RUN + 1.2)}%,100%{opacity:0}}`;
  }
  // head: faces +x, rotates with the path
  const head = `<g class="hd"><g><animateMotion dur="${D}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="0;1;1" keyTimes="0;${(RUN / D).toFixed(5)};1"><mpath href="#route" xlink:href="#route"/></animateMotion>
<g transform="scale(1.25)"><path class="tg" d="M8 0h6l2 -2M14 0l2 2" stroke="#FF453A" stroke-width="1.3" fill="none" stroke-linecap="round"/>
<path d="M-6 -6.2C2 -7.4 9 -4.6 9.5 0C9 4.6 2 7.4 -6 6.2C-8 3 -8 -3 -6 -6.2Z" fill="url(#headg)"/>
<path d="M-3 -5.4c3 1 3 9.8 0 10.8" stroke="#00000033" stroke-width="1" fill="none"/>
<ellipse cx="2.6" cy="-3.4" rx="2.4" ry="1.9" fill="#fff"/><ellipse cx="2.6" cy="3.4" rx="2.4" ry="1.9" fill="#fff"/>
<ellipse cx="3.3" cy="-3.4" rx="1.1" ry="1.5" fill="#0A0A0F"/><ellipse cx="3.3" cy="3.4" rx="1.1" ry="1.5" fill="#0A0A0F"/>
<circle cx="8.2" cy="-1.3" r=".55" fill="#3a0d1c"/><circle cx="8.2" cy="1.3" r=".55" fill="#3a0d1c"/></g></g></g>`;

  // score counter: one label per length, shown while that length is current
  let score = '', scoreStyle = '';
  const marks = [{ tick: 0, len: g.init }, ...g.eats.map(e => ({ tick: e.tick, len: e.len }))];
  marks.forEach((m, i) => {
    const t0 = m.tick * TICK, t1 = i + 1 < marks.length ? marks[i + 1].tick * TICK : RUN + HOLD;
    score += `<text x="${W - 48}" y="84" class="mono sc c${i}" font-size="10" fill="${C.sub}" text-anchor="end">LENGTH <tspan fill="${C.ink}" font-weight="700">${m.len}</tspan>   EATEN <tspan fill="${C.ink}" font-weight="700">${m.len - g.init}</tspan></text>`;
    scoreStyle += `.c${i}{opacity:0;animation:k${i} ${D}s steps(1,end) infinite}@keyframes k${i}{0%{opacity:0}${pct(t0)}%{opacity:1}${pct(Math.min(t1, D - 0.001))}%,100%{opacity:0}}`;
  });

  let over = '', fx = '', overStyle = '';
  if (g.victory) {
    // shimmer wave across every block, then a glitchy VICTORY title
    let shine = '', sparks = '';
    cols.forEach((wk, x) => wk.forEach((d, y) => {
      const delay = RUN + 0.35 + (x + y * 2) * 0.018;
      shine += `<rect x="${gx + x * step}" y="${gy + y * step}" width="${cell}" height="${cell}" rx="3" fill="url(#shg)" class="sh" style="animation-delay:${delay.toFixed(3)}s"/>`;
    }));
    let sd = 11; const r2 = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 26; i++) {
      const x = gx + r2() * gw, y = gy + r2() * gh, z = 2 + r2() * 3.5, dl = RUN + 0.6 + r2() * 2.6;
      sparks += `<path d="M${x.toFixed(1)} ${(y - z).toFixed(1)}L${(x + z * .28).toFixed(1)} ${(y - z * .28).toFixed(1)}L${(x + z).toFixed(1)} ${y.toFixed(1)}L${(x + z * .28).toFixed(1)} ${(y + z * .28).toFixed(1)}L${x.toFixed(1)} ${(y + z).toFixed(1)}L${(x - z * .28).toFixed(1)} ${(y + z * .28).toFixed(1)}L${(x - z).toFixed(1)} ${y.toFixed(1)}L${(x - z * .28).toFixed(1)} ${(y - z * .28).toFixed(1)}Z" fill="#fff" class="sp" style="animation-delay:${dl.toFixed(2)}s"/>`;
    }
    const ty = gy + gh / 2 + 9, sub = `PERFECT RUN · ${g.total}/${g.total} COMMIT-DAYS EATEN · LENGTH ${g.finalLen}`;
    over = `${shine}${sparks}<g class="vc">
<rect x="${W / 2 - 230}" y="${gy + gh / 2 - 30}" width="460" height="60" rx="10" fill="#050507" opacity=".82"/>
<text x="${W / 2 - 2}" y="${ty}" text-anchor="middle" font-size="30" font-weight="900" letter-spacing="10" fill="#28D7FF" class="gl1">VICTORY</text>
<text x="${W / 2 + 2}" y="${ty}" text-anchor="middle" font-size="30" font-weight="900" letter-spacing="10" fill="#FF3B6B" class="gl2">VICTORY</text>
<text x="${W / 2}" y="${ty}" text-anchor="middle" font-size="30" font-weight="900" letter-spacing="10" fill="url(#vg)">VICTORY</text>
<text x="${W / 2}" y="${ty + 17}" text-anchor="middle" class="mono" font-size="9" letter-spacing="2" fill="#FEBC2E">${sub}</text></g>`;
    overStyle = `.sh{opacity:0;animation:shw ${D}s linear infinite both}@keyframes shw{0%{opacity:0}${pct(0.38)}%{opacity:.95}${pct(1.1)}%,100%{opacity:0}}
.sp{opacity:0;transform-box:fill-box;transform-origin:center;animation:spk ${D}s ease-out infinite both}@keyframes spk{0%{opacity:0;transform:scale(.2) rotate(0)}${pct(0.4)}%{opacity:1;transform:scale(1.2) rotate(45deg)}${pct(1)}%,100%{opacity:0;transform:scale(.4) rotate(90deg)}}
.vc{opacity:0;animation:vc ${D}s linear infinite}@keyframes vc{0%,${pct(RUN + 0.2)}%{opacity:0}${pct(RUN + 0.45)}%,${pct(END - 0.1)}%{opacity:1}${pct(END)}%,100%{opacity:0}}
.gl1{animation:g1 .45s steps(2,end) infinite}.gl2{animation:g2 .5s steps(2,end) infinite}
@keyframes g1{0%{transform:translate(-2px,0)}50%{transform:translate(2px,-1px)}100%{transform:translate(-1px,1px)}}
@keyframes g2{0%{transform:translate(2px,1px)}50%{transform:translate(-2px,0)}100%{transform:translate(1px,-1px)}}`;
    fx = `<linearGradient id="vg" x1="0" x2="1"><stop offset="0" stop-color="#FFE29A"/><stop offset=".5" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FEBC2E"/></linearGradient>
<linearGradient id="shg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#FEBC2E" stop-opacity=".4"/></linearGradient>`;
  } else {
    over = `<g class="go"><rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="6" fill="#FF453A" opacity=".10"/>
<rect x="${W / 2 - 250}" y="${gy + gh / 2 - 18}" width="500" height="34" rx="8" fill="#050507" opacity=".85"/>
<text x="${W / 2}" y="${gy + gh / 2 + 5}" text-anchor="middle" class="mono" font-size="14" font-weight="800" letter-spacing="4" fill="#FF6482">GAME OVER · ${g.finalLen - g.init} EATEN · RESTARTING</text></g>`;
    overStyle = `.go{opacity:0;animation:go ${D}s linear infinite}@keyframes go{0%,${pct(RUN)}%{opacity:0}${pct(RUN + 0.15)}%,${pct(RUN + 1.3)}%{opacity:1}${pct(RUN + 1.5)}%,100%{opacity:0}}`;
  }

  const inner = `${windowBar(24, 20, 852, H - 40, '~/activity --play snake', `${fmt(s.year)} commits · ${g.eats.length} active days`)}
<text x="48" y="84" class="mono" font-size="10" fill="${C.sub}"><tspan fill="#28C840">●</tspan> every commit-day is food · the snake grows one block per bite · crash = restart</text>
${score}
<rect x="${gx - 6}" y="${gy - 6}" width="${gw + 12}" height="${gh + 12}" rx="8" fill="none" stroke="${C.line}"/>
${cells}
<g clip-path="url(#board)">${segs}${head}</g>
${over}
<text x="48" y="${H - 34}" class="mono" font-size="9" fill="${C.dim}">play it yourself → muftzyxslwly.my.id/snake.html</text>`;
  return shell(W, H, inner,
    `<path id="route" d="${pathD}"/>
<clipPath id="board"><rect x="${gx - 6}" y="${gy - 6}" width="${gw + 12}" height="${gh + 12}" rx="8"/></clipPath>
${fx}<radialGradient id="headg" cx=".65" cy=".5" r=".7"><stop offset="0" stop-color="#FF8FB0"/><stop offset=".6" stop-color="#FF6482"/><stop offset="1" stop-color="#C2306A"/></radialGradient>`,
    `.f{transform-box:fill-box;transform-origin:center;animation-duration:${D}s;animation-timing-function:linear;animation-iteration-count:infinite}
${segStyle}${scoreStyle}
.hd{animation:hv ${D}s linear infinite}@keyframes hv{0%,${pct(g.victory ? END - 0.3 : RUN + 0.5)}%{opacity:1}${pct(g.victory ? END : RUN + 1.2)}%,100%{opacity:0}}
.tg{animation:tg .9s steps(2,end) infinite}@keyframes tg{50%{opacity:0}}
${overStyle}`);
}

// ---------------- footer ----------------
function footerSvg() {
  return shell(900, 96, `<rect x="24" y="20" width="852" height="56" rx="14" fill="${C.card}" stroke="${C.line}"/>
<rect x="24" y="74" width="852" height="2" fill="url(#g)" class="sweep"/>
<text x="450" y="50" text-anchor="middle" class="mono" font-size="15" font-weight="700" letter-spacing="4" fill="${C.ink}">THANKS FOR STOPPING BY</text>
<text x="450" y="66" text-anchor="middle" class="mono" font-size="9" fill="${C.dim}">every panel here is generated by the scripts in this repo · last run ${stamp}</text>
${[0, 1, 2, 3, 4].map(i => `<rect x="${44 + i * 9}" y="44" width="6" height="6" rx="1.5" fill="${rgb(mix(i / 4))}"/><rect x="${818 + i * 9}" y="44" width="6" height="6" rx="1.5" fill="${rgb(mix(1 - i / 4))}"/>`).join('')}`,
    '', '.sweep{transform-origin:450px 75px;animation:sw 4s ease-in-out infinite alternate}@keyframes sw{from{transform:scaleX(.15)}to{transform:scaleX(1)}}');
}

// ---------------- run ----------------
const t = await contributions();
const s = summarize(t.days);
writeFileSync('assets/stats.svg', statsSvg(t, s));
writeFileSync('assets/skyline.svg', skylineSvg(t.days, s));
writeFileSync('assets/pulse.svg', pulseSvg(t.days, s));
writeFileSync('assets/contrib.json', JSON.stringify({ user: LOGIN, updated: now.toISOString(), year: s.year, days: t.days.filter(d => d.count > 0) }));
const items = await news();
writeFileSync('assets/news.svg', newsHeaderSvg(items.length));
writeFileSync('assets/footer.svg', footerSvg());
const readme = readFileSync('README.md', 'utf8');
const out = readme.replace(/<!--NEWS:START-->[\s\S]*<!--NEWS:END-->/, `<!--NEWS:START-->\n${newsMarkdown(items)}\n<!--NEWS:END-->`);
writeFileSync('README.md', out);
console.log(`ok: ${s.year} contributions last year, ${t.allTime} all time, ${items.length} news items`);
