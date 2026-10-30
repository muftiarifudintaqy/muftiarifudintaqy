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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
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
      const r = Math.random(); const busy = i < 80 ? 70 : 16;
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
  return out.slice(0, 10);
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


// ---------------- live activity grid (bottom panel) ----------------
function pulseSvg(days, s) {
  const W = 900, H = 230, cell = 11, gap = 3, step = cell + gap;
  const weeks = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const cols = weeks.slice(-53);
  const max = Math.max(1, ...days.map(d => d.count));
  const gw = cols.length * step - gap, gx = Math.round((W - gw) / 2), gy = 92, dur = 6;
  let cells = '';
  cols.forEach((wk, w) => wk.forEach((d, i) => {
    const q = d.count / max;
    const fill = d.count ? rgb(mix(Math.min(1, Math.pow(q, 0.6)))) : '#17171E';
    const delay = (w / cols.length * dur).toFixed(2);
    cells += `<rect x="${gx + w * step}" y="${gy + i * step}" width="${cell}" height="${cell}" rx="3" fill="${fill}" class="${d.count ? 'on' : 'off'}" style="animation-delay:${delay}s"><title>${d.date}: ${d.count}</title></rect>`;
  }));
  const inner = `${windowBar(24, 20, 852, H - 40, '~/activity --live --stream', `${fmt(s.year)} events · 53 weeks`)}
<text x="48" y="78" class="mono" font-size="10" fill="${C.sub}"><tspan fill="#28C840">●</tspan> streaming commits from the last 12 months</text>
${cells}
<rect class="bar" x="${gx - 6}" y="${gy - 8}" width="4" height="${7 * step + 12}" rx="2" fill="url(#g)"/>
<rect class="glow" x="${gx - 30}" y="${gy - 8}" width="28" height="${7 * step + 12}" fill="url(#trail)"/>
<rect x="${gx}" y="${gy + 7 * step + 12}" width="${gw}" height="3" rx="1.5" fill="#17171E"/>
<rect class="prog" x="${gx}" y="${gy + 7 * step + 12}" width="${gw}" height="3" rx="1.5" fill="url(#g)"/>`;
  const dx = gw + 12;
  return shell(W, H, inner,
    `<linearGradient id="trail" x1="0" x2="1"><stop offset="0" stop-color="#BF5AF2" stop-opacity="0"/><stop offset="1" stop-color="#BF5AF2" stop-opacity=".35"/></linearGradient>`,
    `.bar,.glow{animation:run ${dur}s linear infinite}@keyframes run{from{transform:translateX(0)}to{transform:translateX(${dx}px)}}
.on{animation:ping ${dur}s linear infinite}@keyframes ping{0%{opacity:1;filter:brightness(2.2)}6%{opacity:1;filter:brightness(1)}100%{opacity:1}}
.off{animation:dim ${dur}s linear infinite}@keyframes dim{0%{fill:#2A2A36}8%{fill:#17171E}}
.prog{transform-origin:${gx}px 0;animation:pg ${dur}s linear infinite}@keyframes pg{from{transform:scaleX(0)}to{transform:scaleX(1)}}`);
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
const items = await news();
writeFileSync('assets/news.svg', newsHeaderSvg(items.length));
writeFileSync('assets/footer.svg', footerSvg());
const readme = readFileSync('README.md', 'utf8');
const out = readme.replace(/<!--NEWS:START-->[\s\S]*<!--NEWS:END-->/, `<!--NEWS:START-->\n${newsMarkdown(items)}\n<!--NEWS:END-->`);
writeFileSync('README.md', out);
console.log(`ok: ${s.year} contributions last year, ${t.allTime} all time, ${items.length} news items`);
