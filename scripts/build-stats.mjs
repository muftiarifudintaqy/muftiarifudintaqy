// Builds assets/stats-light.svg and assets/stats-dark.svg from your GitHub contribution calendar.
// Runs in GitHub Actions (see .github/workflows/update-profile.yml). No dependencies.
import { writeFileSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'muftiarifudintaqy';
const TOKEN = process.env.GITHUB_TOKEN;
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Helvetica,Arial,sans-serif";
const THEMES = {
  light: { bg: '#FBFBFD', ink: '#1D1D1F', sub: '#6E6E73', line: '#E5E5EA', empty: '#EBEBF0' },
  dark:  { bg: '#000000', ink: '#F5F5F7', sub: '#98989D', line: '#2C2C2E', empty: '#1C1C1E' },
};
// Indigo -> violet -> pink, same accent as the portfolio site
const LEVELS = ['#5E5CE6', '#8E5DEB', '#BF5AF2', '#FF6482'];

async function getDays() {
  if (process.env.MOCK) {
    const days = []; const end = new Date();
    for (let i = 370; i >= 0; i--) {
      const d = new Date(end); d.setDate(end.getDate() - i);
      const r = Math.random(); const n = r < 0.45 ? 0 : Math.floor(r * r * (i < 90 ? 60 : 18));
      days.push({ date: d.toISOString().slice(0, 10), count: n });
    }
    return days;
  }
  if (!TOKEN) throw new Error('GITHUB_TOKEN is missing');
  const query = `query($l:String!){user(login:$l){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-stats' },
    body: JSON.stringify({ query, variables: { l: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error('GitHub API error: ' + JSON.stringify(json.errors || json));
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap(w => w.contributionDays.map(d => ({ date: d.date, count: d.contributionCount })));
}

const fmtDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtNum = n => n.toLocaleString('en-US');

function compute(days) {
  const total = days.reduce((a, d) => a + d.count, 0);
  const active = days.filter(d => d.count > 0).length;
  let best = days[0]; for (const d of days) if (d.count > best.count) best = d;
  let longest = 0, run = 0, lStart = null, lEnd = null, start = null;
  for (const d of days) {
    if (d.count > 0) { if (run === 0) start = d.date; run++; if (run > longest) { longest = run; lStart = start; lEnd = d.date; } }
    else run = 0;
  }
  // current streak: allow today to still be empty
  let i = days.length - 1; if (days[i] && days[i].count === 0) i--;
  let current = 0; while (i >= 0 && days[i].count > 0) { current++; i--; }
  return { total, active, best, longest, lStart, lEnd, current };
}

function level(count, max) {
  if (count === 0) return -1;
  const q = count / Math.max(max, 1);
  return q > 0.75 ? 3 : q > 0.45 ? 2 : q > 0.2 ? 1 : 0;
}

function render(days, s, theme) {
  const c = THEMES[theme];
  const W = 880, H = 356, cell = 11, gap = 3, step = cell + gap;
  const weeks = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const cols = weeks.slice(-53);
  const gridW = cols.length * step - gap;
  const gx = Math.round((W - gridW) / 2), gy = 206;
  const max = Math.max(...days.map(d => d.count));

  const metric = (x, value, label) => `
    <text x="${x}" y="92" class="v">${value}</text>
    <text x="${x}" y="118" class="k">${label}</text>`;
  const step4 = (W - 96) / 4;
  const metrics = [
    metric(48, fmtNum(s.total), 'contributions in the last year'),
    metric(48 + step4, fmtNum(s.active), 'active days'),
    metric(48 + step4 * 2, `${s.longest} day${s.longest === 1 ? '' : 's'}`, s.lStart ? `longest streak, ${fmtDate(s.lStart)} to ${fmtDate(s.lEnd)}` : 'longest streak'),
    metric(48 + step4 * 3, fmtNum(s.best.count), `best day, ${fmtDate(s.best.date)}`),
  ].join('');

  let cells = '', months = '', lastMonth = '', lastX = -99;
  cols.forEach((w, wi) => {
    const m = new Date(w[0].date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    if (m !== lastMonth) { if (wi - lastX >= 3 && wi < cols.length - 2) { months += `<text x="${gx + wi * step}" y="${gy - 10}" class="m">${m}</text>`; lastX = wi; } lastMonth = m; }
    w.forEach((d, di) => {
      const lv = level(d.count, max);
      const fill = lv < 0 ? c.empty : LEVELS[lv];
      const delay = (wi * 0.012).toFixed(3);
      cells += `<rect x="${gx + wi * step}" y="${gy + di * step}" width="${cell}" height="${cell}" rx="3" fill="${fill}" style="animation-delay:${delay}s"><title>${d.date}: ${d.count}</title></rect>`;
    });
  });
  const synced = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const curr = s.current > 0 ? `Current streak ${s.current} day${s.current === 1 ? '' : 's'}.` : 'No commits yet today.';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub contributions: ${s.total} in the last year">
<style>
text{font-family:${FONT}}
.t{font-size:15px;font-weight:600;fill:${c.ink}}
.v{font-size:34px;font-weight:700;letter-spacing:-1px;fill:${c.ink}}
.k{font-size:13px;fill:${c.sub}}
.m{font-size:11px;fill:${c.sub}}
.f{font-size:12px;fill:${c.sub}}
rect[style]{opacity:0;animation:pop .5s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes pop{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){rect[style]{opacity:1;animation:none}}
</style>
<rect width="${W}" height="${H}" rx="28" fill="${c.bg}"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="27.5" fill="none" stroke="${c.line}"/>
<text x="48" y="44" class="t">GitHub activity</text>
${metrics}
${months}
${cells}
<text x="48" y="${H - 26}" class="f">${curr} Updated ${synced}.</text>
</svg>`;
}

const days = await getDays();
const stats = compute(days);
for (const t of Object.keys(THEMES)) writeFileSync(`assets/stats-${t}.svg`, render(days, stats, t));
console.log('stats updated', stats.total, 'contributions');
