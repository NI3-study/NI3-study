/**
 * tools/render-qa.mjs — 실제 브라우저에서 site/ 를 한 번만 훑는 렌더 검사.
 *
 * 무엇을 보는가 (페이지 × 뷰포트 × 색 구성표마다):
 *   · .gnn-fig-slot 중 data-gnn-ready="1" 이 된 수 vs 슬롯 수  (마운트 실패 = 폴백 노출)
 *   · 콘솔 error/exception  (api.github.com 은 무시한다 — Material의 별 개수 조회다)
 *   · mjx-merror 개수  (MathJax가 삼킨 수식 오류. 화면에는 빨간 글자로만 남는다)
 *   · documentElement.scrollWidth vs clientWidth  (가로 스크롤 = 좁은 화면 파손)
 *   · 슬롯 안 모든 <svg>의 bounding rect vs 그 슬롯의 rect  (틀 밖으로 삐져나간 그림)
 *
 * ── Windows 헤드리스의 --window-size 함정 ──────────────────────────
 * `--window-size=1440,900` 은 Windows에서 **요청대로 적용되지 않는다.** 헤드리스라도
 * 창 크기는 호스트의 화면 크기·DPI 배율에 눌려 조용히 작아지고(1440 요청 → 1280 같은
 * 값), 페이지는 더 좁은 레이아웃 뷰포트로 그려진다. 그러면 "데스크톱 폭에서 멀쩡하다"는
 * 결론이 사실은 태블릿 폭의 결론이 되고, 반대로 좁은 폭에서만 나는 파손을 넓은 폭의
 * 파손으로 착각하게 된다. 창 크기는 손대지 않고 CDP의
 * Emulation.setDeviceMetricsOverride 로 레이아웃 뷰포트를 직접 고정한다. 이 파일이
 * --window-size 를 쓰지 않는 이유가 그것이다. 실제 폭은 매번 window.innerWidth 로
 * 되읽어 표에 적는다 — 요청 폭과 다르면 그 자체가 실패다.
 *
 * 관문: site/ 가 낡았으면 Chrome을 띄우지 않는다(build-manifest --check). 낡은 site/를
 * 찍은 스크린샷은 거짓 통과와 거짓 실패를 함께 만든다.
 *
 *   .\tools\build.ps1            # 먼저. 빌드 + 매니페스트 기록
 *   node tools/render-qa.mjs     # 세션당 한 번. 결과는 .cache/qa/render/report.json
 *
 * 옵션: --base http://127.0.0.1:8765 | --pages 01,05 | --no-screens
 * 의존성 없음. Node 22+ 의 전역 WebSocket/fetch 를 쓴다.
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTDIR = join(ROOT, '.cache', 'qa', 'render');
const VIEWS = [
  { w: 390, h: 844, mobile: true },
  { w: 768, h: 1024, mobile: false },
  { w: 1440, h: 900, mobile: false }
];
const SCHEMES = ['light', 'dark'];
const IGNORE_HOST = 'api.github.com';

/* ── CLI ──────────────────────────────────────────────────────── */

const USAGE = [
  '사용법: node tools/render-qa.mjs [옵션]',
  '  --base <url>     검사할 주소 (기본 http://127.0.0.1:8765)',
  '  --pages <a,b>    페이지 부분집합 (예: index,01,05)',
  '  --no-screens     스크린샷을 남기지 않는다',
  '  --help'
].join('\n');

function parseArgs(argv) {
  const out = { base: 'http://127.0.0.1:8765', pages: null, screens: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') out.base = argv[++i];
    else if (a === '--pages') out.pages = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--no-screens') out.screens = false;
    else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
    else { console.error(`알 수 없는 인자: ${a}\n${USAGE}`); process.exit(2); }
  }
  if (!out.base) { console.error(`--base 에 주소가 없다\n${USAGE}`); process.exit(2); }
  out.base = out.base.replace(/\/+$/, '');
  return out;
}
const ARGS = parseArgs(process.argv.slice(2));

/* ── 페이지 목록: docs/*.md 가 단일 진실이다 ──────────────────── */

function pageList() {
  return readdirSync(join(ROOT, 'docs'))
    .filter((n) => n.endsWith('.md'))
    .map((n) => n.replace(/\.md$/, ''))
    .map((stem) => ({
      key: stem === 'index' ? 'index' : (stem.match(/^\d+/) || [stem])[0],
      stem,
      url: stem === 'index' ? '/' : `/${stem}/`,
      // 기대 슬롯 수는 마크다운이 정한다. 그림이 없는 문서(index·04)는 0이 정답이고,
      // 있던 슬롯이 사라진 것은 실패다. "0개면 실패"로 두면 둘을 구분하지 못한다.
      expect: (readFileSync(join(ROOT, 'docs', stem + '.md'), 'utf8')
        .match(/data-gnn-fig="/g) || []).length
    }))
    .sort((a, b) => (a.key === 'index' ? -1 : b.key === 'index' ? 1 : a.key.localeCompare(b.key)));
}

/* ── 최소 CDP 드라이버 (.cache/qa/cdp.mjs 에서 승격) ──────────── */

async function launch(port, profile) {
  // --window-size 는 쓰지 않는다. 파일 머리의 함정 설명을 볼 것.
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars=false', '--force-device-scale-factor=1',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
  ];
  const child = spawn(CHROME, args, { stdio: 'ignore', detached: false });
  child.on('error', () => {});
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      return { child, ver: await r.json(), port };
    } catch { await sleep(200); }
  }
  child.kill();
  throw new Error(`Chrome이 뜨지 않았다: ${CHROME}`);
}

class Conn {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
        }
      } else for (const h of this.handlers) h(msg);
    });
  }
  on(fn) { this.handlers.push(fn); return () => { this.handlers = this.handlers.filter((h) => h !== fn); }; }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout ' + method)); }
      }, 60000).unref?.();
    });
  }
}

async function connect(port) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('CDP 소켓 연결 실패')));
  });
  return new Conn(ws);
}

/** 새 탭을 열고 뷰포트·색 구성표를 강제한 뒤 이동한다. */
async function visit(conn, url, { width, height, mobile = false, dark = false }) {
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const logs = [];
  const off = conn.on((m) => {
    if (m.sessionId !== s) return;
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push({
        kind: 'console.' + m.params.type,
        text: (m.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ')
      });
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push({ kind: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text, url: d.url });
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      logs.push({ kind: 'log.' + e.level, text: e.text, url: e.url, source: e.source });
    }
  });
  await conn.send('Runtime.enable', {}, s);
  await conn.send('Log.enable', {}, s);
  await conn.send('Page.enable', {}, s);
  // 창 크기가 아니라 레이아웃 뷰포트를 직접 고정한다.
  await conn.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height
  }, s);
  if (mobile) await conn.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
  await conn.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]
  }, s);
  const loaded = new Promise((res) => {
    const offL = conn.on((m) => { if (m.sessionId === s && m.method === 'Page.loadEventFired') { offL(); res(); } });
  });
  await conn.send('Page.navigate', { url }, s);
  await Promise.race([loaded, sleep(30000)]);
  const ev = async (expr) => {
    const r = await conn.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, s);
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  return {
    logs, eval: ev,
    async shot(path) {
      const m = await ev('({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})');
      const r = await conn.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: m.w, height: Math.min(m.h, 12000), scale: 0.5 }
      }, s);
      await writeFile(path, Buffer.from(r.data, 'base64'));
    },
    async close() { off(); await conn.send('Target.closeTarget', { targetId }); }
  };
}

/* ── 페이지 안에서 재는 것 ────────────────────────────────────── */

const PROBE = `(() => {
  const slots = Array.from(document.querySelectorAll('.gnn-fig-slot'));
  const de = document.documentElement;
  // 조상 중에 가로 스크롤 상자가 있으면 그 안쪽이 넓은 것은 설계다
  // (.gnn-frame--full .gnn-frame__stage 가 그렇다). 페이지를 넓히지도 않는다.
  // 주의: overflow 는 인라인 상자에는 적용되지 않는데 getComputedStyle 은 그래도
  // 값을 돌려준다. display 를 함께 보지 않으면 span.arithmatex 를 스크롤 상자로
  // 착각해서, 그 안의 mjx-assistive-mml 이 만드는 진짜 가로 스크롤을 놓친다.
  const boxed = (el, stop) => {
    for (var p = el.parentElement; p && p !== stop; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (cs.display === 'inline' || cs.display === 'contents') continue;
      if (['auto', 'scroll', 'hidden'].indexOf(cs.overflowX) >= 0) return true;
    }
    return false;
  };
  const over = [], scrolled = [];
  for (const s of slots) {
    const sr = s.getBoundingClientRect();
    for (const svg of s.querySelectorAll('svg')) {
      const r = svg.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;
      const dx = Math.max(sr.left - r.left, r.right - sr.right);
      const dy = Math.max(sr.top - r.top, r.bottom - sr.bottom);
      if (dx <= 1 && dy <= 1) continue;
      const rec = {
        id: s.getAttribute('data-gnn-fig'),
        frame: ((svg.querySelector('title') || {}).textContent || '').slice(0, 24),
        dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10,
        svg: Math.round(r.width) + 'x' + Math.round(r.height),
        slot: Math.round(sr.width) + 'x' + Math.round(sr.height)
      };
      (boxed(svg, s.parentElement) ? scrolled : over).push(rec);
    }
  }
  // 가로 스크롤을 실제로 만든 요소를 지목한다. 겹칠 때는 가장 바깥만 남긴다.
  const cw = de.clientWidth, bad = new Set(), culprits = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    // 오른쪽으로 넘친 것만 본다. LTR에서 왼쪽 음수 영역(Material의 서랍 메뉴)과
    // position:fixed 는 문서의 가로 스크롤을 만들지 않는다.
    if (r.width < 1 || r.right <= cw + 1) continue;
    if (getComputedStyle(el).position === 'fixed') continue;
    if (boxed(el, document.body)) continue;
    bad.add(el);
  }
  for (const el of bad) {
    if (el.parentElement && bad.has(el.parentElement)) continue;
    const r = el.getBoundingClientRect();
    const host = el.closest('.arithmatex, .gnn-fig-slot, table, pre, .md-typeset');
    culprits.push({
      sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''),
      left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
      host: host ? host.tagName.toLowerCase() + '.' + String(host.className || '').split(/\\s+/)[0] : '',
      text: ((host || el).textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60)
    });
  }
  culprits.sort((a, b) => b.right - a.right);
  return {
    scrolled, culprits: culprits.slice(0, 4),
    slots: slots.length,
    ready: slots.filter((s) => s.getAttribute('data-gnn-ready') === '1').length,
    notReady: slots.filter((s) => s.getAttribute('data-gnn-ready') !== '1')
      .map((s) => s.getAttribute('data-gnn-fig') + '=' + (s.getAttribute('data-gnn-ready') || 'none')),
    fallbackShown: slots.filter((s) =>
      Array.from(s.querySelectorAll('.gnn-fallback')).some((f) => !f.hidden)).length,
    svgs: document.querySelectorAll('.gnn-fig-slot svg').length,
    merror: document.querySelectorAll('mjx-merror').length,
    mjx: document.querySelectorAll('mjx-container').length,
    rawTex: (document.body.innerText.match(/\\\\(frac|tilde|hat|sqrt)/g) || []).length,
    scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, innerWidth: window.innerWidth,
    overflow: over
  };
})()`;

/** 마운트와 수식 조판이 멎을 때까지 기다린다. 고정 sleep은 느리고 헐겁다. */
async function settle(page) {
  let last = null;
  for (let i = 0; i < 60; i++) {
    const m = await page.eval(PROBE);
    if (last && m.ready === last.ready && m.mjx === last.mjx && m.slots === last.slots &&
        (m.slots === 0 || m.ready === m.slots) && (m.mjx > 0 || i > 12)) return m;
    last = m;
    await sleep(250);
  }
  return last;
}

/* ── 관문: site/ 가 최신인가 ──────────────────────────────────── */

if (!existsSync(CHROME)) {
  console.error(`Chrome이 없다: ${CHROME}`);
  process.exit(2);
}
const gate = spawnSync(process.execPath, [join(ROOT, 'tools', 'build-manifest.mjs'), '--check'],
  { stdio: 'inherit', cwd: ROOT });
if (gate.status !== 0) {
  console.error('렌더 검사를 시작하지 않는다 — Chrome을 띄우기 전에 site/를 다시 빌드한다.');
  process.exit(gate.status || 1);
}

/* ── 실행 ─────────────────────────────────────────────────────── */

const pages = pageList().filter((p) => !ARGS.pages || ARGS.pages.includes(p.key) || ARGS.pages.includes(p.stem));
if (!pages.length) { console.error(`--pages 가 아무 페이지도 고르지 않았다: ${ARGS.pages}`); process.exit(2); }

mkdirSync(OUTDIR, { recursive: true });
const rows = [];
const problems = [];
const startedAt = new Date().toISOString();

for (const [si, scheme] of SCHEMES.entries()) {
  const profile = join(ROOT, '.cache', 'qa', `profile-${scheme}`);
  rmSync(profile, { recursive: true, force: true });   // 매번 새 프로필 — 캐시가 낡은 site/를 되살리지 못하게.
  mkdirSync(profile, { recursive: true });
  const port = 9331 + si;
  const br = await launch(port, profile);
  const conn = await connect(port);
  try {
    for (const view of VIEWS) {
      for (const p of pages) {
        const url = ARGS.base + p.url;
        const row = { page: p.key, url, width: view.w, height: view.h, scheme, expect: p.expect, fail: [] };
        let page = null;
        try {
          page = await visit(conn, url, { width: view.w, height: view.h, mobile: view.mobile, dark: scheme === 'dark' });
          const m = await settle(page);
          Object.assign(row, {
            slots: m.slots, ready: m.ready, svgs: m.svgs, merror: m.merror, mjx: m.mjx,
            scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, innerWidth: m.innerWidth,
            overflow: m.overflow, scrolledStages: m.scrolled, culprits: m.culprits,
            notReady: m.notReady, fallbackShown: m.fallbackShown
          });
          const errs = page.logs.filter((l) => (l.kind === 'exception' || /error/i.test(l.kind)) &&
            !((l.text || '') + (l.url || '')).includes(IGNORE_HOST));
          row.errors = errs.map((l) => `${l.kind}: ${(l.text || '').replace(/\s+/g, ' ').slice(0, 160)}`);

          // 레이아웃 뷰포트는 clientWidth 다. innerWidth 는 모바일 에뮬레이션의
          // shrink-to-fit 때문에 내용이 넘치면 따라 커진다 — 뷰포트 판정에 쓰면 안 된다.
          if (m.clientWidth !== view.w) row.fail.push(`레이아웃 뷰포트 폭이 ${m.clientWidth} (요청 ${view.w}) — 창 크기에 눌렸다`);
          if (m.slots !== p.expect) row.fail.push(`슬롯 ${m.slots}개 — 마크다운은 ${p.expect}개를 적어 두었다`);
          if (m.ready !== m.slots) row.fail.push(`마운트 ${m.ready}/${m.slots} [${m.notReady.join(', ')}]`);
          if (m.fallbackShown) row.fail.push(`무JS 폴백이 ${m.fallbackShown}곳 노출`);
          if (m.merror) row.fail.push(`mjx-merror ${m.merror}개`);
          if (m.scrollWidth > m.clientWidth + 1) {
            row.fail.push(`가로 스크롤 ${m.scrollWidth} > ${m.clientWidth}` +
              (m.culprits.length
                ? ` ← ${m.culprits.map((c) => `${c.sel}${c.host ? '@' + c.host : ''} [${c.left},${c.right}] "${c.text}"`).join(' | ')}`
                : ' ← 원인 요소를 특정하지 못했다'));
          }
          if (m.overflow.length) row.fail.push(`슬롯 밖 SVG ${m.overflow.length}개 (${m.overflow.slice(0, 2).map((o) => `${o.id} +${Math.max(o.dx, o.dy)}px`).join(', ')})`);
          if (row.errors.length) row.fail.push(`콘솔 오류 ${row.errors.length}건: ${row.errors[0]}`);

          if (ARGS.screens) {
            row.shot = `${p.key}-${view.w}-${scheme}.png`;
            await page.shot(join(OUTDIR, row.shot));
          }
        } catch (err) {
          row.fail.push('예외: ' + String(err && err.message).slice(0, 200));
        } finally {
          if (page) await page.close().catch(() => {});
        }
        rows.push(row);
        if (row.fail.length) problems.push(row);
        process.stderr.write(`  ${row.fail.length ? 'FAIL' : 'ok  '} ${p.key} ${view.w} ${scheme}\n`);
      }
    }
  } finally {
    try { await conn.send('Browser.close'); } catch { /* 이미 죽었다 */ }
    br.child.kill();
  }
}

/* ── 보고 ─────────────────────────────────────────────────────── */

const pad = (s, n) => String(s).padEnd(n);
console.log('\n페이지 폭   구성 마운트 SVG merror 가로폭      결과');
for (const r of rows) {
  console.log(
    `${pad(r.page, 6)}${pad(r.width, 5)}${pad(r.scheme, 6)}` +
    `${pad(`${r.ready ?? '-'}/${r.slots ?? '-'}`, 7)}${pad(r.svgs ?? '-', 4)}${pad(r.merror ?? '-', 7)}` +
    `${pad(`${r.scrollWidth ?? '-'}/${r.clientWidth ?? '-'}`, 12)}${r.fail.length ? 'FAIL ' + r.fail[0] : 'OK'}`
  );
}
const report = {
  startedAt, finishedAt: new Date().toISOString(), base: ARGS.base,
  views: VIEWS, schemes: SCHEMES, pages: pages.map((p) => p.key),
  pass: problems.length === 0, checked: rows.length, failed: problems.length, rows
};
writeFileSync(join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`\n${rows.length - problems.length}/${rows.length} 통과 · 기록 .cache/qa/render/report.json`);
if (problems.length) {
  for (const r of problems) console.error(`  FAIL ${r.page} ${r.width} ${r.scheme}\n        ${r.fail.join('\n        ')}`);
  process.exit(1);
}
