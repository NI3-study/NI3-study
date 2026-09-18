/**
 * tools/verify-figures.mjs
 *
 * 그림과 본문에 적힌 수치를 두 경로로 교차 검증한다.
 *
 *   경로 A — 이 파일 안에서 간선 목록만 보고 처음부터 다시 계산한 값
 *   경로 B — docs/javascripts/gnn/*.js 가 실제로 계산해 캡션에 넣는 값
 *   경로 C — 손으로 유도한 닫힌 형태(1/18, 25/72, 고유값 0·0.5·1.5·2 등)
 *
 * 셋이 어긋나면 실패한다. 실행: node tools/verify-figures.mjs
 *
 * 인자 없이 부르면 예전과 똑같이 전부 돈다. 아래 플래그는 "고친 것만 빨리 보기"와
 * "게이트 조이기" 두 가지에만 쓴다.
 *
 *   --only <id[,id]>   그림별 검사를 그 id들로 제한한다 (전역 규약 검사는 그대로 돈다)
 *   --file <path>      그 문서의 검사와 그 문서에 걸린 그림만 본다
 *   --list             등록된 그림 id를 줄마다 하나씩 찍고 0으로 끝낸다
 *   --quiet            표준출력을 닫는다 — 실패(FAIL)와 경고(WARN)만 남는다
 *   --warn-as-error    WARN 한 건도 실패로 센다
 *
 * 모르는 플래그는 사용법을 stderr로 찍고 2로 끝난다(1은 "검사 실패"의 자리다).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EPS = 5e-4;

/* ── CLI ───────────────────────────────────────────────
 *
 * 필터는 검사 코드를 건드리지 않는다. 검사 이름의 규약이 곧 필터다:
 * "<그림 id>: …" 는 그 그림의 검사, "01 …"·"d01: …" 는 그 문서의 검사,
 * 접두사가 없는 것은 전역 규약 검사여서 어떤 필터에서도 돈다.
 */

const USAGE = [
  '사용법: node tools/verify-figures.mjs [옵션]',
  '  --only <id[,id]>   그림별 검사를 그 id들로 제한한다',
  '  --file <path>      그 문서(docs/*.md)의 검사와 거기 걸린 그림만 본다',
  '  --list             등록된 그림 id를 찍고 끝낸다',
  '  --quiet            실패와 경고만 남긴다',
  '  --warn-as-error    WARN도 실패로 센다'
].join('\n');

/** 등록부를 VM에 올리기 전에도 id가 필요하다. figures.js의 등록 블록을 그대로 읽는다. */
function figureIds() {
  const src = readFileSync(join(ROOT, 'docs/javascripts/gnn/figures.js'), 'utf8');
  const m = /NI3\.figures\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(src);
  return m ? [...m[1].matchAll(/'([a-z0-9-]+)'\s*:/g)].map((x) => x[1]) : [];
}
const docFiles = () => readdirSync(join(ROOT, 'docs')).filter((n) => n.endsWith('.md'));

function parseArgs(argv) {
  const opt = { only: null, file: null, list: false, quiet: false, warnAsError: false };
  const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(2); };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') {
      const ids = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!ids.length) die('--only 에 그림 id가 없다');
      const unknown = ids.filter((id) => !figureIds().includes(id));
      if (unknown.length) die(`--only: 등록되지 않은 그림 id — ${unknown.join(', ')}`);
      opt.only = new Set(ids);
    } else if (a === '--file') {
      const f = String(argv[++i] || '').replace(/\\/g, '/').split('/').pop();
      if (!docFiles().includes(f)) die(`--file: docs/ 안의 .md 가 아니다 — ${argv[i]}`);
      opt.file = f;
    } else if (a === '--list') opt.list = true;
    else if (a === '--quiet') opt.quiet = true;
    else if (a === '--warn-as-error') opt.warnAsError = true;
    else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
    else die(`알 수 없는 인자: ${a}`);
  }
  return opt;
}

const ARGS = parseArgs(process.argv.slice(2));
if (ARGS.list) { for (const id of figureIds()) console.log(id); process.exit(0); }
// quiet는 표준출력만 닫는다. FAIL(stderr)과 WARN(stderr)은 그대로 보인다.
if (ARGS.quiet) console.log = () => {};

const FIG_IDS = new Set(figureIds());
/** 문서 검사의 이름표 → 파일. 파일 이름이 바뀌어도 번호 접두사를 따라간다. */
const DOC_OF = { idx: 'index.md', index: 'index.md' };
for (const f of docFiles()) {
  const n = (f.match(/^(\d+)_/) || [])[1];
  if (n) { DOC_OF[n] = f; DOC_OF['d' + n] = f; }
}

/** 그림이 실린 문서. contract.page가 있으면 그것이, 없으면 마크업의 슬롯 위치가 답이다. */
const PAGE_OF = new Map();
function pageOfFigure(id) {
  if (PAGE_OF.has(id)) return PAGE_OF.get(id);
  let page = null;
  try { page = (NI3.figures[id]().contract || {}).page || null; }
  catch { /* 등록부가 아직 안 올라왔거나 계약이 없다 — 마크업으로 떨어진다 */ }
  if (!page) {
    for (const f of docFiles()) {
      if (readFileSync(join(ROOT, 'docs', f), 'utf8').includes(`data-gnn-fig="${id}"`)) { page = f; break; }
    }
  }
  PAGE_OF.set(id, page);
  return page;
}

function targetOf(name) {
  // mathLint처럼 "docs/04_exercises.md:159 …" 로 자리를 밝히는 검사.
  const p = /^docs\/([0-9a-z_]+\.md)/.exec(name);
  if (p) return { doc: p[1] };
  const m = /^([a-z0-9][a-z0-9-]*)\s*:/.exec(name);
  if (m && FIG_IDS.has(m[1])) return { fig: m[1] };
  if (m && DOC_OF[m[1]]) return { doc: DOC_OF[m[1]] };
  const d = /^(\d{2})[\s§]/.exec(name);
  if (d && DOC_OF[d[1]]) return { doc: DOC_OF[d[1]] };
  if (/^index /.test(name)) return { doc: 'index.md' };
  return {};
}

let skipped = 0;
function selected(name) {
  if (!ARGS.only && !ARGS.file) return true;
  const t = targetOf(name);
  if (t.fig) {
    if (ARGS.only && !ARGS.only.has(t.fig)) return false;
    if (ARGS.file) {
      const p = pageOfFigure(t.fig);
      if (p && p !== ARGS.file) return false;
    }
    return true;
  }
  if (t.doc && ARGS.file && t.doc !== ARGS.file) return false;
  return true;   // 대상을 못 읽는 검사는 전역 규약이다. 어떤 필터에서도 돈다.
}

let failures = 0;
let checks = 0;

function ok(name, cond, detail) {
  if (!selected(name)) { skipped++; return; }
  checks++;
  if (cond) return;
  failures++;
  console.error(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`);
}

/** 실패는 아니지만 기준선에 닿은 것. 종료 코드는 건드리지 않는다. */
let warnings = 0;
function warn(name, detail) {
  if (!selected(name)) { skipped++; return; }
  warnings++;
  console.warn(`  WARN  ${name}${detail ? '  — ' + detail : ''}`);
}

function near(name, got, want, eps = EPS) {
  ok(name, Math.abs(got - want) <= eps, `got ${got}, want ${want}`);
}

function nearArr(name, got, want, eps = EPS) {
  ok(
    name,
    got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= eps),
    `got [${got.map((v) => v.toFixed(4))}], want [${want.map((v) => v.toFixed(4))}]`
  );
}

function section(title) {
  console.log(`\n== ${title}`);
}

/* ── 경로 A: 독립 구현 ─────────────────────────────────── */

const mul = (A, B) =>
  A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const pow = (A, k) => {
  let R = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let t = 0; t < k; t++) R = mul(R, A);
  return R;
};
const rowSum = (A) => A.map((r) => r.reduce((a, b) => a + b, 0));
const colOf = (v) => v.map((t) => [t]);
const flat = (M) => M.map((r) => r[0]);

function build(nodes, edges) {
  const idx = Object.fromEntries(nodes.map((id, i) => [id, i]));
  const n = nodes.length;
  const A = Array.from({ length: n }, () => Array(n).fill(0));
  for (const [a, b] of edges) {
    A[idx[a]][idx[b]] = 1;
    A[idx[b]][idx[a]] = 1;
  }
  const At = A.map((r, i) => r.map((v, j) => (i === j ? 1 : v)));
  const dt = rowSum(At);
  const d = rowSum(A);
  const Ahat = At.map((r, i) => r.map((v, j) => v / Math.sqrt(dt[i] * dt[j])));
  const Amean = At.map((r, i) => r.map((v) => v / dt[i]));
  const Ssym = A.map((r, i) => r.map((v, j) => v / Math.sqrt(d[i] * d[j])));
  const L = Ssym.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) - v));
  const Iplus = Ssym.map((r, i) => r.map((v, j) => (i === j ? v + 1 : v)));
  return { nodes, edges, idx, A, At, d, dt, Ahat, Amean, Ssym, L, Iplus };
}

function hops(g, start) {
  const dist = Object.fromEntries(g.nodes.map((id) => [id, Infinity]));
  dist[start] = 0;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    for (const [a, b] of g.edges) {
      const nb = a === q[h] ? b : b === q[h] ? a : null;
      if (nb != null && dist[nb] === Infinity) {
        dist[nb] = dist[q[h]] + 1;
        q.push(nb);
      }
    }
  }
  return dist;
}

/** det(M − λI) — 고유값 주장을 특성다항식으로 직접 검증한다. */
function detMinus(M, lam) {
  const n = M.length;
  const A = M.map((r, i) => r.map((v, j) => (i === j ? v - lam : v)));
  let det = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14) return 0;
    if (p !== c) { const t = A[p]; A[p] = A[c]; A[c] = t; det = -det; }
    det *= A[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return det;
}

const G4 = build([1, 2, 3, 4], [[1, 2], [1, 3], [2, 4]]);
const G4S = build([1, 2, 3, 4, 5, 6], [[1, 2], [1, 3], [2, 4], [1, 5], [1, 6]]);
const G4T = build([1, 2, 3, 4, 5, 6, 7, 8],
  [[1, 2], [1, 3], [2, 4], [1, 5], [1, 6], [2, 7], [2, 8]]);

const S6 = Math.sqrt(6);

/* ── 경로 B: 사이트 코드를 그대로 실행 ─────────────────── */

/**
 * 최소 DOM 대역. 브라우저 자동화가 없으므로 primitives.js가 실제로 만드는
 * 노드 트리를 여기서 그대로 만들어 놓고 기하를 읽는다. 캡션 문자열만 보는
 * 검증은 "프레임 밖으로 삐져나간 글자"를 절대 잡지 못한다.
 */
function domShim() {
  const node = (tag, ns) => ({
    tagName: tag, ns, attrs: {}, children: [], textContent: '',
    style: { setProperty() {} },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.unshift(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    addEventListener() {},
    querySelectorAll() { return []; },
    get firstChild() { return this.children[0] || null; }
  });
  return {
    createElementNS: (ns, tag) => node(tag, ns),
    createElement: (tag) => node(tag, null),
    readyState: 'complete',
    addEventListener() {},
    querySelectorAll: () => []
  };
}

const sandbox = { console, Math, Object, Array, String, Number, JSON, Infinity, isNaN };
sandbox.globalThis = sandbox;
sandbox.document = domShim();
createContext(sandbox);
for (const f of ['registry.js', 'primitives.js', 'figures.js']) {
  runInContext(readFileSync(join(ROOT, 'docs/javascripts/gnn', f), 'utf8'), sandbox, {
    filename: f
  });
}
const NI3 = sandbox.NI3GNN;
const site = (id) => NI3.figures[id]();
const frameText = (spec, state = {}) =>
  spec.frames(state).map((f) => f.caption + ' ' + f.desc).join('\n');

/* ── 렌더 탐침: 실제 노드 트리의 기하를 읽는다 ─────────── */

const CSS = readFileSync(join(ROOT, 'docs/stylesheets/extra.css'), 'utf8');
const FONT = {};
for (const m of CSS.matchAll(/\.([a-zA-Z0-9_-]+)[^{}]*\{[^}]*?font-size:\s*([\d.]+)px/g)) {
  FONT[m[1]] = Math.max(FONT[m[1]] || 0, parseFloat(m[2]));
}

/** 글자 폭 추정. 한글은 전각, 위첨자는 좁게 본다. 여백은 호출부에서 준다. */
function textWidth(s, size) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x2070 && c <= 0x209f) w += 0.45;
    else if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) ||
             (c >= 0x3130 && c <= 0x318f) || (c >= 0x4e00 && c <= 0x9fff)) w += 1;
    else if (c >= 0x2000) w += 0.85;
    else w += 0.56;
  }
  return w * size;
}

function fontOf(el) {
  const cls = (el.attrs['class'] || '').split(/\s+/);
  let size = 0;
  for (const c of cls) if (FONT[c]) size = Math.max(size, FONT[c]);
  return size || 10;
}

const NUM = (v) => (v == null ? null : parseFloat(v));

/** 한 SVG 요소가 차지하는 x/y 구간. 모르는 태그는 null. */
function extentOf(el) {
  const a = el.attrs;
  if (el.tagName === 'rect') {
    const x = NUM(a.x), y = NUM(a.y), w = NUM(a.width), h = NUM(a.height);
    return x == null ? null : { x0: x, x1: x + w, y0: y, y1: y + h };
  }
  if (el.tagName === 'circle') {
    const cx = NUM(a.cx), cy = NUM(a.cy), r = NUM(a.r);
    return cx == null ? null : { x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r };
  }
  if (el.tagName === 'ellipse') {
    const cx = NUM(a.cx), cy = NUM(a.cy), rx = NUM(a.rx), ry = NUM(a.ry);
    return cx == null ? null : { x0: cx - rx, x1: cx + rx, y0: cy - ry, y1: cy + ry };
  }
  if (el.tagName === 'line') {
    const p = [NUM(a.x1), NUM(a.x2), NUM(a.y1), NUM(a.y2)];
    return p.some((v) => v == null) ? null
      : { x0: Math.min(p[0], p[1]), x1: Math.max(p[0], p[1]),
          y0: Math.min(p[2], p[3]), y1: Math.max(p[2], p[3]) };
  }
  if (el.tagName === 'path' && a.d) {
    const n = (a.d.match(/-?[\d.]+/g) || []).map(Number);
    if (n.length < 2) return null;
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  if (el.tagName === 'text') {
    const x = NUM(a.x), y = NUM(a.y);
    if (x == null || y == null) return null;
    const size = fontOf(el);
    const w = textWidth(el.textContent || '', size);
    const anchor = a['text-anchor'];
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    return { x0, x1: x0 + w, y0: y - size, y1: y + size * 0.3, text: true };
  }
  return null;
}

/* ── 원시형 호출 계측 ───────────────────────────────────
 *
 * buildFigure가 frame.draw에 건네는 api는 primitives.js 안의 지역 함수 묶음이라
 * NI3.px를 덮어써도 잡히지 않는다. 그래서 명세를 복제해 draw만 가로채고,
 * 그 자리에서 실제로 건네받은 api 객체를 감싼다. 그림이 계약에 없는 원시형을
 * 부르면 시각 어휘가 조용히 늘어난 것이므로 여기서 걸린다.
 */
const API_KEYS = new Set();
let API_SAMPLE = null;

function wrapApi(api, calls) {
  if (!API_SAMPLE) API_SAMPLE = api;
  const out = {};
  for (const k of Object.keys(api)) {
    API_KEYS.add(k);
    const v = api[k];
    out[k] = typeof v === 'function'
      ? function (...args) { if (calls) calls.add(k); return v.apply(this, args); }
      : v;
  }
  return out;
}

/** 명세는 그대로 두고 draw만 감싼 복제본. */
function probed(spec, calls) {
  const copy = Object.assign({}, spec);
  copy.frames = (state) => spec.frames(state).map((f) => {
    const g = Object.assign({}, f);
    g.draw = (root, api) => f.draw(root, wrapApi(api, calls));
    return g;
  });
  return copy;
}

/** <figure> 하나를 만들고 프레임별로 (svg, 요소 목록)을 돌려준다.
 *  placed()가 거는 translate를 누적해야 원반 표면 좌표가 맞는다.
 *  겹침 검사가 "같은 <g> 형제"를 빼야 하므로 직속 부모도 같이 싣는다. */
function render(id, calls) {
  const spec = site(id);
  const fig = NI3.px.buildFigure(calls ? probed(spec, calls) : spec);
  const out = [];
  const walk = (el, into, tx, ty, parent) => {
    const tr = el.attrs && el.attrs.transform;
    const m = tr && /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(tr);
    const dx = tx + (m ? parseFloat(m[1]) : 0);
    const dy = ty + (m ? parseFloat(m[2]) : 0);
    if (el.tagName === 'svg') {
      const vb = (el.attrs.viewBox || '').split(/\s+/).map(Number);
      const items = [];
      out.push({ svg: el, vb, items });
      // defs 안의 marker/pattern은 좌표계가 따로다. 기하 검사에서 뺀다.
      for (const c of el.children) if (c.tagName !== 'defs') walk(c, items, 0, 0, el);
      return;
    }
    if (into) into.push({ el, dx, dy, parent });
    for (const c of el.children) walk(c, into, dx, dy, el);
  };
  walk(fig, null, 0, 0, null);
  return { fig, frames: out };
}

/* ── 배치 토큰 ──────────────────────────────────────────
 * registry.js의 NI3.LAYOUT이 정본이다. 아직 없으면 계약 문서의 기본값을 쓰되
 * 그 사실을 한 줄로 알린다 — 조용히 다른 수를 쓰면 검사가 거짓말을 한다. */
const LAYOUT_DEFAULT = { safeArea: 6, gap: { textText: 1.5 }, spans: ['auto', 'full'] };
const LAY = NI3.LAYOUT || null;
const SAFE_AREA = LAY && LAY.safeArea != null ? LAY.safeArea : LAYOUT_DEFAULT.safeArea;
const GAP_TT = LAY && LAY.gap && LAY.gap.textText != null
  ? LAY.gap.textText : LAYOUT_DEFAULT.gap.textText;
const SPANS = (LAY && LAY.spans) || LAYOUT_DEFAULT.spans;
if (!LAY) {
  console.log('  NOTE  NI3.LAYOUT이 아직 없다 — safeArea 6 · gap.textText 1.5 · ' +
    'spans [auto, full] 기본값으로 검사한다.');
}

const CLS = (el) => (el && el.attrs && el.attrs['class']) || '';

/**
 * viewBox 밖으로 나간 요소를 찾는다.
 *
 * 글자는 "대충 안쪽"이 아니라 엄격히 안쪽이어야 한다. 잘린 글자는 폭 추정
 * 오차가 아니라 읽히지 않는 글자이기 때문이다. 그래서 여유 6px을 걷어내고
 *   · viewBox 밖으로 한 점이라도 나가면 FAIL
 *   · 안에는 있으나 안전 여백(safeArea)을 파먹으면 WARN
 * 으로 나눈다.
 *
 * 도형은 두 갈래다. rect·circle·ellipse는 면을 가진 도형이어서 bbox가 곧 실물
 * 경계다 — 여유를 주면 실제로 잘린 테를 놓친다(테 왼끝 x = −1 이 2px 슬랙에
 * 숨었던 일이 있다). 그래서 면 도형은 여유 0, 엄격히 안쪽이어야 한다.
 * line·path만 획이라 표시자 끝(marker tip)이 bbox 밖으로 조금 자라므로 2px을 준다.
 */
const AREA_TAGS = new Set(['rect', 'circle', 'ellipse']);
function overflows(id, safeArea) {
  const safe = safeArea == null ? SAFE_AREA : safeArea;
  const bad = [];
  const soft = [];
  render(id).frames.forEach((fr, k) => {
    const [vx, vy, vw, vh] = fr.vb;
    for (const { el, dx, dy } of fr.items) {
      const e = extentOf(el);
      if (!e) continue;
      const x0 = e.x0 + dx, x1 = e.x1 + dx, y0 = e.y0 + dy, y1 = e.y1 + dy;
      const where = `f${k} ${fr.svg.children[0].textContent.slice(0, 12)}… ` +
        `${el.tagName}"${(el.textContent || CLS(el)).slice(0, 16)}" ` +
        `[${x0.toFixed(1)},${x1.toFixed(1)}]×[${y0.toFixed(1)},${y1.toFixed(1)}] ` +
        `vb ${vw}×${vh}`;
      if (e.text) {
        const out = Math.max(vx - x0, x1 - (vx + vw), vy - y0, y1 - (vy + vh));
        if (out > 0) {
          bad.push(`${where} 밖으로 ${out.toFixed(2)}`);
        } else {
          const bite = Math.max(vx + safe - x0, x1 - (vx + vw - safe),
            vy + safe - y0, y1 - (vy + vh - safe));
          if (bite > 0) soft.push(`${where} 안전 여백 ${safe} 잠식 ${bite.toFixed(2)}`);
        }
      } else {
        const slack = AREA_TAGS.has(el.tagName) ? 0 : 2;
        const out = Math.max(vx - slack - x0, x1 - (vx + vw + slack),
          vy - slack - y0, y1 - (vy + vh + slack));
        if (out > 0) bad.push(`${where} 밖으로 ${out.toFixed(2)} (여유 ${slack})`);
      }
    }
  });
  return { bad, soft };
}

/**
 * 글자가 다른 것과 겹치는 자리를 찾는다. 겹친 글자는 둘 다 못 읽는다.
 *
 * 빼는 쌍:
 *   · 직속 부모 <g>가 같은 쌍 — 원반과 그 안의 숫자처럼 한 덩이로 배치된 것
 *   · .gnn-cell__fill · .gnn-cell__neg — 칸 글자 밑에 깔리라고 만든 채움
 *   · .gnn-ring rect — 구성원을 통째로 감싸는 테. 겹치는 것이 본분이다
 * 글자–도형은 면을 가진 rect·circle만 본다. line·path는 획이라 bbox가 대각선을
 * 통째로 감싸므로 겹침 판정의 근거가 되지 못한다(오탐 300여 건).
 */
function overlaps(id, gap) {
  const g = gap == null ? GAP_TT : gap;
  const hits = [];
  const tag = (o) =>
    `${o.el.tagName}"${(o.el.textContent || CLS(o.el)).slice(0, 18)}"` +
    `[${o.x0.toFixed(1)},${o.x1.toFixed(1)}]×[${o.y0.toFixed(1)},${o.y1.toFixed(1)}]`;

  render(id).frames.forEach((fr, k) => {
    const list = [];
    for (const it of fr.items) {
      const e = extentOf(it.el);
      if (!e) continue;
      list.push({
        el: it.el, parent: it.parent, text: !!e.text,
        x0: e.x0 + it.dx, x1: e.x1 + it.dx, y0: e.y0 + it.dy, y1: e.y1 + it.dy
      });
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (!A.text && !B.text) continue;          // 도형끼리는 겹쳐도 된다
        if (A.parent === B.parent) continue;       // 같은 <g> 안은 한 덩이다
        if (!(A.text && B.text)) {
          const s = A.text ? B : A;
          if (s.el.tagName !== 'rect' && s.el.tagName !== 'circle') continue;
          if (/\bgnn-cell__fill\b|\bgnn-cell__neg\b/.test(CLS(s.el))) continue;
          if (s.el.tagName === 'rect' && /\bgnn-ring\b/.test(CLS(s.parent))) continue;
        }
        const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
        const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        if (ox <= g || oy <= g) continue;          // 축마다 gap.textText 만큼은 봐준다
        hits.push(`${id} f${k}: ${tag(A)} ↔ ${tag(B)} ` +
          `겹침 ${ox.toFixed(1)}×${oy.toFixed(1)} (허용 ${g})`);
      }
    }
  });
  return hits;
}

/* ══ 1. G4 기본량 ═══════════════════════════════════════ */

section('G4 — 정전 그래프');
nearArr('d̃ = (3,3,2,2)', G4.dt, [3, 3, 2, 2]);
near('Â₁₁ = 1/3', G4.Ahat[0][0], 1 / 3);
near('Â₁₃ = 1/√6', G4.Ahat[0][2], 1 / S6);
near('Â₃₃ = 1/2', G4.Ahat[2][2], 0.5);
ok('Â 대칭', G4.Ahat.every((r, i) => r.every((v, j) => Math.abs(v - G4.Ahat[j][i]) < 1e-12)));
nearArr('Â 행 합은 1이 아니다', rowSum(G4.Ahat),
  [1 / 3 + 1 / 3 + 1 / S6, 1 / 3 + 1 / 3 + 1 / S6, 1 / S6 + 0.5, 1 / S6 + 0.5]);
ok('Â 행 합 ≠ 1', rowSum(G4.Ahat).every((v) => Math.abs(v - 1) > 0.05));

const x4 = [1, 2, 3, 4];
nearArr('AX = (5,5,1,2)  [01 §8]', flat(mul(G4.A, colOf(x4))), [5, 5, 1, 2]);
nearArr('(A+I)X = (6,7,4,6)  [01 §5.4·§8]', flat(mul(G4.At, colOf(x4))), [6, 7, 4, 6]);
nearArr('ÂX ≈ (2.2247, 2.6330, 1.9082, 2.8165)  [02 §6]',
  flat(mul(G4.Ahat, colOf(x4))), [2.2247, 2.6330, 1.9082, 2.8165], 1e-3);
nearArr('ReLU(ÂXW), W=[2] ≈ (4.4495, 5.2660, 3.8165, 5.6330)  [02 §6]',
  flat(mul(G4.Ahat, colOf(x4))).map((v) => 2 * v),
  [4.4495, 5.2660, 3.8165, 5.6330], 1e-3);

/* ══ 1b. 상태 전이 — H⁽ˡ⁾ → m⁽ˡ⁾ → H⁽ˡ⁺¹⁾ ═════════════ */

section('상태 전이 (01 §5.4)');
{
  const spec = site('state-transition');
  const fr = spec.frames({});
  const deg = rowSum(G4.A);
  const degOf = (id) => deg[G4.idx[id]];
  const upd = flat(mul(G4.At, colOf(x4)));

  ok('프레임은 4장 — 입력 · 국소 예시 2 · 조립', fr.length === 4, `got ${fr.length}`);

  const local = fr.filter((f) => f.local != null);
  ok('국소 예시가 정확히 2장', local.length === 2, `got ${local.length}`);
  const ids = local.map((f) => f.local);
  ok('두 예시는 내부(차수 최대)와 잎(차수 1) 한 쌍',
    Math.max(...ids.map(degOf)) === Math.max(...deg) && Math.min(...ids.map(degOf)) === 1,
    `ids ${ids}, deg ${ids.map(degOf)}`);
  ok('네 정점을 하나씩 되풀이하는 패널이 없다',
    fr.every((f) => !/읽는 소형 다중|읽기:/.test(f.title + f.caption)));

  const hand = fr.filter((f) => f.handoff);
  ok('다음 층 인계 프레임이 정확히 하나', hand.length === 1, `got ${hand.length}`);
  ok('인계 프레임이 H⁽ˡ⁺¹⁾ → 다음 층 입력을 말한다',
    hand.length === 1 && hand[0].desc.includes('H⁽ˡ⁺¹⁾') && /다음 층의 입력/.test(hand[0].desc));
  ok('인계 프레임에 병렬 진술이 남아 있다',
    hand.length === 1 && /병렬/.test(hand[0].desc + hand[0].caption));

  const t = frameText(spec) + spec.caption + spec.badge + spec.title;
  for (const v of ['h⁽ˡ⁾', 'm⁽ˡ⁾', 'h⁽ˡ⁺¹⁾', 'H⁽ˡ⁾', 'H⁽ˡ⁺¹⁾']) {
    ok(`상태 전이 어휘 "${v}" 가 있다`, t.includes(v));
  }
  ok('"읽는다"류의 모호한 표현이 없다', !/읽는|읽기/.test(t));
  ok('비학습 장난감 집계임을 명시한다', /비학습 장난감/.test(t));
  ok('집계가 층이 아니라 하위 단계임을 명시한다', /하위 단계/.test(t));
  ok('두 예시의 새 상태가 같다 — 합 집계 충돌의 근거',
    upd[G4.idx[ids[0]]] === upd[G4.idx[ids[1]]],
    `${upd[G4.idx[ids[0]]]} vs ${upd[G4.idx[ids[1]]]}`);
  ok('두 예시의 송신자 수는 다르다 — 반복이 아니라 난도 상승',
    degOf(ids[0]) !== degOf(ids[1]));
}

/* ══ 1c. 집계기 충돌 (01 §6) ═══════════════════════════ */

section('집계기 충돌 — 합 / 평균 / 최댓값');
{
  const sum = (s) => s.reduce((a, b) => a + b, 0);
  const mean = (s) => sum(s) / s.length;
  const max = (s) => Math.max(...s);

  // 경로 A: 주장 자체를 여기서 다시 계산한다.
  ok('{1,1,1} vs {1} — 합만 구분한다',
    sum([1, 1, 1]) !== sum([1]) && mean([1, 1, 1]) === mean([1]) && max([1, 1, 1]) === max([1]));
  ok('{1,3} vs {2,2} — 최댓값만 구분한다',
    sum([1, 3]) === sum([2, 2]) && mean([1, 3]) === mean([2, 2]) && max([1, 3]) !== max([2, 2]));

  const spec = site('aggregate-collide');
  const fr = spec.frames({});
  ok('사례는 2건뿐 (각 사례가 다른 것을 가르친다)', fr.length === 2, `got ${fr.length}`);
  const t = frameText(spec) + spec.caption;
  for (const rho of ['합', '평균', '최댓값']) ok(`ρ = ${rho} 가 등장한다`, t.includes(rho));
  ok('충돌과 분리를 모두 판정한다', /충돌/.test(t) && /분리/.test(t));
  ok('충돌이 다음 상태로 이어짐을 말한다',
    /h.?⁽ˡ⁺¹⁾/.test(t) && /m.?⁽ˡ⁾/.test(t) && /되살리지 못한다/.test(t));
  ok('정전 그래프의 실제 충돌과 이어 붙어 있다',
    t.includes('§5.4') && t.includes(String(flat(mul(G4.At, colOf(x4)))[0])));
}

/* ══ 2. 계보 스트립 (2채널판) ═══════════════════════════ */

section('계보 스트립 — 2채널판');
const X2 = [[1, 0], [0, 1], [1, 1], [2, 1]];
const W2 = [[1, -1], [-1, 1]];
const AhX = mul(G4.Ahat, X2);
const AhXW = mul(AhX, W2);
nearArr('ÂXW 첫 열 = (0, 1/√6, 1/√6, 1/2−1/√6)  [04 해설 4]',
  AhXW.map((r) => r[0]), [0, 1 / S6, 1 / S6, 0.5 - 1 / S6]);
ok('ÂXW 둘째 열 = −첫 열 (σ가 자를 칸이 있다)',
  AhXW.every((r) => Math.abs(r[0] + r[1]) < 1e-12));
near('1/2 − 1/√6 ≈ 0.0918  [04 해설 4]', 0.5 - 1 / S6, 0.0918, 1e-4);
ok('(ÂX)W = Â(XW) — 결합법칙  [03 §2]',
  mul(G4.Ahat, mul(X2, W2)).every((r, i) =>
    r.every((v, j) => Math.abs(v - AhXW[i][j]) < 1e-12)));
const clipped = AhXW.flat().filter((v) => v < -1e-9).length;
ok('ReLU가 자르는 칸 = 3', clipped === 3, `got ${clipped}`);
{
  const spec = site('lineage-strip');
  const t = frameText(spec);
  ok('site: ⑤ 프레임에 W 기둥이 하나', /딱 하나/.test(t));
  ok('site: σ가 자르는 칸 수가 본문과 같다', t.includes('음수 ' + clipped + '칸'));
  // 계보는 층 하나를 여섯 칸으로 편 것이다. 시작과 끝, 그리고 재입력이 보여야 한다.
  ok('site: ① 칸이 H⁽ˡ⁾에서 시작한다', /① X = H⁽ˡ⁾/.test(t));
  ok('site: ⑥ 칸이 H⁽ˡ⁺¹⁾로 끝난다', /σ\(ÂXW\) = H⁽ˡ⁺¹⁾/.test(t));
  ok('site: 마지막 출력이 다음 층의 ① 자리로 되먹임된다',
    /되먹임 화살/.test(t) && /다음 층/.test(t));
  ok('site: 여섯 칸이 층 여섯 개가 아님을 명시', /하위 단계/.test(spec.caption + t));
  ok('site: 같은 여섯 칸을 두 번 늘어놓지 않는다', spec.frames({}).length === 6);
  const per = frameText(site('lineage-strip'), { w: 'per' });
  ok('site: 비공유 W는 파라미터 16개', /16개/.test(per));
  ok('site: 비공유 W는 새 정점에 쓸 W가 없다', /새 정점 v₅/.test(per));
}

/* ══ 3. 정규화 3지 (G4★) ══════════════════════════════ */

section('G4★ — raw / mean / sym');
nearArr('d̃ = (5,3,2,2,2,2)', G4S.dt, [5, 3, 2, 2, 2, 2]);
ok('G4의 네 정점이 그대로 남아 있다',
  [[1, 2], [1, 3], [2, 4]].every(([a, b]) => G4S.A[G4S.idx[a]][G4S.idx[b]] === 1));

const x6 = [1, 2, 3, 4, 5, 6];
const rawOut = flat(mul(G4S.At, colOf(x6)));
const meanOut = flat(mul(G4S.Amean, colOf(x6)));
const symOut = flat(mul(G4S.Ahat, colOf(x6)));
const ratio = (v) => Math.max(...v) / Math.min(...v);

nearArr('raw 출력 = (17,7,4,6,6,7)', rawOut, [17, 7, 4, 6, 6, 7]);
nearArr('mean 출력 = (3.40,2.33,2.00,3.00,3.00,3.50)', meanOut,
  [3.4, 7 / 3, 2, 3, 3, 3.5]);
nearArr('mean 행 합은 전부 정확히 1.00', rowSum(G4S.Amean), [1, 1, 1, 1, 1, 1], 1e-12);
nearArr('sym 행 합 = (1.41,1.00,0.82,0.91,0.82,0.82)', rowSum(G4S.Ahat),
  [1.4069, 0.9998, 0.8162, 0.9082, 0.8162, 0.8162], 1e-3);
ok('sym 행 합은 1이 아니다 (v₃)', Math.abs(rowSum(G4S.Ahat)[2] - 1) > 0.15);
near('raw 격차 = 4.25배', ratio(rawOut), 4.25, 1e-3);
near('mean 격차 = 1.75배', ratio(meanOut), 1.75, 1e-3);
near('sym 격차 = 2.83배', ratio(symOut), 2.832, 1e-3);
ok('raw > sym > mean 순서', ratio(rawOut) > ratio(symOut) && ratio(symOut) > ratio(meanOut));
near('Â₃₁ = 1/√10 ≈ 0.316 (수신자 v₃, 송신자 v₁ 차수 5)', G4S.Ahat[2][0], 1 / Math.sqrt(10));
near('Â₄₂ = 1/√6 ≈ 0.408 (수신자 v₄, 송신자 v₂ 차수 3)', G4S.Ahat[3][1], 1 / S6);
ok('받는 쪽 차수가 같은데 계수가 다르다 — 송신자 차수 감쇠',
  G4S.dt[2] === G4S.dt[3] && Math.abs(G4S.Ahat[2][0] - G4S.Ahat[3][1]) > 0.09);
{
  const t = frameText(site('norm-3up'));
  ok('site: raw 격차 4.25배', t.includes('4.25배'));
  ok('site: mean 격차 1.75배', t.includes('1.75배'));
  ok('site: sym 격차 2.83배', t.includes('2.83배'));
}

/* ══ 4. 깊이 — 수용 집합 vs 영향력 ═════════════════════ */

section('깊이 — 수용 집합과 영향력');
const dG4 = hops(G4, 3);
nearArr('G4, v₃ 기준 |N_k| = 1,2,3,4',
  [0, 1, 2, 3].map((k) => G4.nodes.filter((id) => dG4[id] <= k).length), [1, 2, 3, 4]);

const A3 = pow(G4.Ahat, 3)[G4.idx[3]];
nearArr('(Â³)₃· = (29/(36√6), 7/(18√6), 25/72, 1/18)  [04 해설 7]',
  A3, [29 / (36 * S6), 7 / (18 * S6), 25 / 72, 1 / 18]);
nearArr('(Â³)₃· ≈ (0.329, 0.159, 0.347, 0.056)', A3, [0.329, 0.159, 0.347, 0.056], 1e-3);
ok('테 안에 있으면서 기여가 1/6 미만인 정점이 있다 (v₄)',
  A3[3] / Math.max(...A3) < 1 / 6);
near('3-hop v₄ 기여 = 1/18', A3[3], 1 / 18, 1e-9);

const dT = hops(G4T, 3);
nearArr('G4▲, v₃ 기준 |N_k| = 1,2,5,8',
  [0, 1, 2, 3].map((k) => G4T.nodes.filter((id) => dT[id] <= k).length), [1, 2, 5, 8]);
near('G4▲ 병목 간선 계수 Â₁₂ = 0.20', G4T.Ahat[G4T.idx[1]][G4T.idx[2]], 0.2);
const T3 = pow(G4T.Ahat, 3)[G4T.idx[3]];
near('G4▲ (Â³)₃,₇ = 1/50 = 0.020', T3[G4T.idx[7]], 0.02, 1e-9);
near('G4▲ (Â³)₃,₃ = 0.245', T3[G4T.idx[3]], 0.245, 1e-9);
near('v₇ 기여는 v₃ 자신의 8%', T3[G4T.idx[7]] / T3[G4T.idx[3]] * 100, 8.16, 0.05);
ok('왼쪽 {3,5,6}에서 오른쪽 {4,7,8}로 가는 간선은 (1,2) 하나뿐',
  G4T.edges.filter(([a, b]) => {
    const left = (v) => [3, 5, 6, 1].includes(v);
    const right = (v) => [4, 7, 8, 2].includes(v);
    return (left(a) && right(b)) || (left(b) && right(a));
  }).length === 1);
{
  const t = frameText(site('depth-frames'));
  ok('site: k=3 프레임에 1/18의 세 자리 표기', t.includes('0.056'));
  ok('site: G4▲ 프레임에 병목 계수', t.includes('0.20'));
}

/* ══ 5. 스펙트럼 ═══════════════════════════════════════ */

section('스펙트럼');
// 05가 쓰는 분해. 이름은 이미 최상위에 있는 x4·specL·rt·specA·sq와 겹치지 않는다.
const opsG4 = NI3.gr.ops(NI3.graphs.G4);
const eigL = NI3.la.jacobiEig(opsG4.L);
const c = flat(mul(eigL.vectors, colOf(x4)));

// 경로 C: 손유도. G4는 경로 그래프 3–1–2–4이고 이분이므로 λ_max(L) = 2.
const specL = [0, 0.5, 1.5, 2];
for (const lam of specL) {
  near(`det(L − ${lam}I) = 0`, detMinus(G4.L, lam), 0, 1e-9);
}
for (const lam of specL) {
  near(`det((I+D^-1/2 A D^-1/2) − ${lam}I) = 0`, detMinus(G4.Iplus, lam), 0, 1e-9);
}
ok('spec(I + D^-1/2 A D^-1/2) ⊂ [0, 2]  [논문 §2.2]',
  Math.min(...specL) >= 0 && Math.max(...specL) <= 2);

const rt = Math.sqrt(1 / 4 + 4 / 6);
const specA = [(0.5 - rt) / 2, 1 / 6, (0.5 + rt) / 2, 1].sort((a, b) => a - b);
for (const mu of specA) near(`det(Â − ${mu.toFixed(4)}I) = 0`, detMinus(G4.Ahat, mu), 0, 1e-9);
nearArr('spec(Â) ≈ (−0.2287, 0.1667, 0.7287, 1)', specA,
  [-0.2287135, 0.1666667, 0.7287135, 1], 1e-6);
ok('spec(Â) ⊂ (−1, 1]', Math.min(...specA) > -1 && Math.abs(Math.max(...specA) - 1) < 1e-12);

// Â의 최대 고유벡터는 √d̃ 이고 고유값은 정확히 1이다.
const sq = G4.dt.map(Math.sqrt);
nearArr('Â √d̃ = √d̃ (고유값 1)', flat(mul(G4.Ahat, colOf(sq))), sq, 1e-12);

// 경로 B: 사이트의 Jacobi 결과가 위 닫힌 형태와 일치하는가
{
  const ops = NI3.gr.ops(NI3.graphs.G4);
  nearArr('site: spec(L)', NI3.la.jacobiEig(ops.L).values, specL, 1e-8);
  nearArr('site: spec(I + D^-1/2 A D^-1/2)', NI3.la.jacobiEig(ops.Iplus).values, specL, 1e-8);
  nearArr('site: spec(Â)', NI3.la.jacobiEig(ops.Ahat).values, specA, 1e-8);

  const eig = eigL;
  const flips = eig.vectors.map((v) =>
    NI3.graphs.G4.edges.filter(([a, b]) => v[ops.idx[a]] * v[ops.idx[b]] < 0).length);
  nearArr('고유벡터의 부호 변화 = 0,1,2,3 (주파수 순서)', flips, [0, 1, 2, 3], 0);
  eig.vectors.forEach((v, k) => {
    const Lv = flat(mul(ops.L, colOf(v)));
    nearArr(`L u${k + 1} = λ${k + 1} u${k + 1}`, Lv, v.map((t) => t * eig.values[k]), 1e-8);
  });
}
{
  const t = frameText(site('spec-explode')) + frameText(site('spec-mu'));
  ok('site: (d)를 동치가 아니라고 명시', /동치가 아니다|동치를 깨는/.test(
    site('spec-mu').falsify + t));
  ok('site: λ_max ≈ 2 를 근사로 표시', /근사/.test(frameText(site('spec-cheby'))));
  // M-12: 두 연산자의 고유벡터는 언제나 같다. 옛 캡션이 되살아나면 잡는다.
  ok('site: "대응 고유벡터는 다르다"가 남아 있지 않다',
    !/대응(하는)? 고유벡터는 (서로 )?다르다/.test(t));
}

/* ══ 5b. 05 스펙트럼 다리 — 삼중 대조 ═══════════════════ */

section('05 스펙트럼 다리');
{
  const R2 = Math.SQRT2, R3 = Math.sqrt(3);

  // 경로 B(사이트 분해) ↔ 경로 A(여기서 다시 센 값) ↔ 경로 C(닫힌 형태)
  nearArr('c = Uᵀx', c, [4.5898, -0.9856, -2.8167, -0.1691], 1e-4);
  const cC = [(3 * R2 + 7) / S6, -(1 + R2) / S6, (3 - 7 * R2) / S6, (1 - R2) / S6];
  nearArr('c 닫힌 형태', c, cC, 1e-9);
  near('Σc² = ‖x‖² = 30', c.reduce((a, v) => a + v * v, 0), 30, 1e-9);

  const roughA = flat(mul(G4.L, colOf(x4))).reduce((a, v, i) => a + v * x4[i], 0);
  near('xᵀLx = 12.4437', roughA, 12.4437, 1e-4);
  near('Σλc² = xᵀLx',
    eigL.values.reduce((a, l, k) => a + l * c[k] * c[k], 0), 12.4437, 1e-4);
  near('xᵀLx = ½c₂² + 1.5c₃² + 2c₄²  [경로 C]',
    0.5 * cC[1] * cC[1] + 1.5 * cC[2] * cC[2] + 2 * cC[3] * cC[3], roughA, 1e-9);
  near('거칢 중 λ=1.5 모드의 몫', 1.5 * c[2] * c[2] / 12.443651, 0.9564, 1e-3);
  near('제곱합 중 λ=1.5 모드의 몫', c[2] * c[2] / 30, 0.2645, 1e-3);

  // S8 — g(λ) = 1 − λ 는 정점 쪽 S 한 번과 같다. 배수표 (1,0,0,0)은 √d 방향만 남긴다.
  const gain = eigL.values.map((l) => 1 - l);
  const back = [0, 1, 2, 3].map((i) =>
    c.reduce((s, t, k) => s + t * gain[k] * eigL.vectors[k][i], 0));
  nearArr('Ug(Λ)Uᵀx = Sx', back, flat(mul(G4.Ssym, colOf(x4))), 1e-9);
  nearArr('Sx ≈ (3.1213, 3.3284, 0.7071, 1.4142)',
    flat(mul(G4.Ssym, colOf(x4))), [3.1213, 3.3284, 0.7071, 1.4142], 1e-4);
  const only = [0, 1, 2, 3].map((i) => c[0] * eigL.vectors[0][i]);
  nearArr('g = (1,0,0,0) 결과 [경로 C]', only,
    [(6 + 7 * R2) / 6, (6 + 7 * R2) / 6, (3 * R2 + 7) / 6, (3 * R2 + 7) / 6], 1e-9);

  // S10 — K-hop 국소성.
  near('(L²)₃₄ = 0', pow(G4.L, 2)[G4.idx[3]][G4.idx[4]], 0, 1e-12);
  near('(L³)₃₄ = −1/4', pow(G4.L, 3)[G4.idx[3]][G4.idx[4]], -0.25, 1e-12);

  // S11 — Chebyshev 세 벌과 재척도.
  const T = NI3.la.cheby(opsG4.Ltilde, 2);
  near('λ_max(G4) = 2', opsG4.lmax, 2, 1e-9);
  ok('T₀(L̃) = I', T[0].every((r, i) => r.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-12)));
  ok('T₁(L̃) = −S', T[1].every((r, i) =>
    r.every((v, j) => Math.abs(v + G4.Ssym[i][j]) < 1e-12)));
  near('T₂(L̃)₁₁ = 1/2', T[2][G4.idx[1]][G4.idx[1]], 0.5, 1e-12);
  near('T₂(L̃)₃₃ = 0', T[2][G4.idx[3]][G4.idx[3]], 0, 1e-12);
  near('T₂(L̃)₁₄ = 1/√2', T[2][G4.idx[1]][G4.idx[4]], 1 / Math.SQRT2, 1e-12);
  ok('T₂(L̃)는 1-hop 세 쌍에서 정확히 0',
    [[1, 2], [1, 3], [2, 4]].every(([a, b]) => Math.abs(T[2][G4.idx[a]][G4.idx[b]]) < 1e-12));

  const oc = NI3.gr.ops(NI3.graphs.G4circ);
  ok('G4○는 G4의 네 정점과 세 간선을 그대로 둔다',
    [[1, 2], [1, 3], [2, 4]].every(([a, b]) => oc.A[oc.idx[a]][oc.idx[b]] === 1) &&
    [1, 2, 3, 4].every((id) =>
      NI3.graphs.G4circ.pos[id].join(',') === NI3.graphs.G4.pos[id].join(',')));
  near('G4○ λ_max = 1 − cos(4π/5)  [5-사이클]', oc.lmax, 1 - Math.cos(4 * Math.PI / 5), 1e-9);
  near('G4○ λ_max ≈ 1.809', oc.lmax, 1.809017, 1e-6);
  near('G4○ 2/λ_max ≈ 1.106', 2 / oc.lmax, 1.1056, 1e-4);

  // S13·S15 — 반복과 눈금.
  nearArr('(I+S)⁴x = (40.29, 44.36, 27.20, 32.96)',
    flat(mul(pow(G4.Iplus, 4), colOf(x4))), [40.29, 44.36, 27.20, 32.96], 5e-2);
  nearArr('(I+S)⁸x = (668.1, 688.7, 465.1, 494.3)',
    flat(mul(pow(G4.Iplus, 8), colOf(x4))), [668.1, 688.7, 465.1, 494.3], 5e-2);
  const mu = specA[2];
  near('μ₃ = 0.7287', mu, 0.7287136, 1e-6);
  near('μ₃의 8제곱 = 0.0795 (0.0806이 아니다)', Math.pow(mu, 8), 0.079516, 1e-6);

  // S15 반증 — Â의 μ=1 모드 √d̃ 를 L의 모드로 쪼개면 성분이 둘이다.
  const comp = flat(mul(eigL.vectors, colOf(sq)));
  nearArr('√d̃ 의 분해 [경로 C]', comp, [2 + 2 / R3, 0, (2 * R3 - 4) / S6, 0], 1e-9);
  near('u₁ᵀ√d̃ ≈ 3.1547', comp[0], 3.1547, 1e-4);
  near('u₃ᵀ√d̃ ≈ −0.2188', comp[2], -0.2188, 1e-4);
  ok('0이 아닌 성분이 둘 — √d̃ 는 L의 고유벡터가 아니다',
    comp.filter((v) => Math.abs(v) > 1e-9).length === 2);
}
{
  const t = frameText(site('spec-mu'));
  // 부록 A 머리의 재계산 정정 — 거듭제곱을 말하는 자리에서는 네 자리 μ를 쓴다.
  ok('site: μ 를 네 자리 0.7287 로 적는다', t.includes('0.7287'));
  ok('site: μ의 8제곱이 0.0795 (0.0806·0.0798이 아니다)',
    t.includes('0.0795') && !t.includes('0.0806') && !t.includes('0.0798'));
  const tc = frameText(site('spec-cheby'));
  ok('site: G4○의 λ_max = 1.809 와 2/λ_max = 1.106',
    tc.includes('1.809') && tc.includes('1.106'));
  ok('site: Chebyshev 캡션이 근사의 범위를 K = 1 뒤로 한정한다', /K = 1/.test(tc));
}

/* ══ 6. 반복 전파와 수렴 ═══════════════════════════════ */

section('반복 전파와 표현 수렴');
const hk = (k) => flat(mul(pow(G4.Ahat, k), colOf(x4)));
const lim = sq.map((v) => v * sq.reduce((a, t, i) => a + t * x4[i], 0) /
  sq.reduce((a, t) => a + t * t, 0));
nearArr('극한 = (2.615, 2.615, 2.135, 2.135)', lim, [2.6147, 2.6147, 2.1349, 2.1349], 1e-3);
nearArr('Â¹x  [02 §6과 동일]', hk(1), [2.2247, 2.6330, 1.9082, 2.8165], 1e-3);
nearArr('Â²x = (2.398, 2.769, 1.862, 2.483)', hk(2), [2.398, 2.769, 1.862, 2.483], 1e-3);
nearArr('Â³²x ≈ 극한', hk(32), lim, 1e-4);
near('극한의 v₁/v₃ 비 = √3/√2 = 1.2247', lim[0] / lim[2], Math.sqrt(3 / 2), 1e-6);

const spread = (k) => {
  const r = hk(k).map((v, i) => v / sq[i]);
  return Math.max(...r) - Math.min(...r);
};
const sp = [0, 1, 2, 4, 8].map(spread);
nearArr('행 간 최대 거리 (k = 0,1,2,4,8)', sp,
  [2.251, 0.707, 0.439, 0.236, 0.067], 1e-3);
ok('단조 감소', sp.every((v, i) => i === 0 || v < sp[i - 1]));
ok('값 자체는 죽지 않는다 (k=8에서도 2 이상)', hk(8).every((v) => v > 2));
{
  const t = frameText(site('oversmoothing'));
  ok('site: k=8 행 간 거리 0.067', t.includes('0.067'));
  ok('site: 극한 2.615 / 2.135', t.includes('2.615') && t.includes('2.135'));
}

/* ══ 7. 반지도 — 전 정점 forward vs 손실 마스크 ════════ */

section('반지도 — forward와 손실 마스크');
const W0 = [[1, -1], [-1, 1]];
const relu = (M) => M.map((r) => r.map((v) => (v > 0 ? v : 0)));
const softmax = (M) => M.map((r) => {
  const e = r.map((v) => Math.exp(v - Math.max(...r)));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
});
function run(nodes, edges) {
  const g = build(nodes, edges);
  const Xs = nodes.map((id) => X2[id - 1]);
  const H1 = relu(mul(mul(g.Ahat, Xs), W0));
  return { idx: g.idx, Z: softmax(mul(g.Ahat, H1)) };
}
const full = run([1, 2, 3, 4], [[1, 2], [1, 3], [2, 4]]);
const cut = run([1, 2, 4], [[1, 2], [2, 4]]);

ok('forward는 라벨 수와 무관하게 네 행 전부를 만든다', full.Z.length === 4);
ok('모든 행이 확률분포', full.Z.every((r) => Math.abs(r[0] + r[1] - 1) < 1e-12));
ok('라벨 없는 v₃을 빼면 라벨 있는 v₁의 예측이 바뀐다',
  Math.abs(full.Z[0][0] - cut.Z[cut.idx[1]][0]) > 1e-3,
  `${full.Z[0][0].toFixed(4)} → ${cut.Z[cut.idx[1]][0].toFixed(4)}`);
ok('라벨 없는 v₃을 빼면 2-hop 밖의 v₄ 예측도 바뀐다',
  Math.abs(full.Z[3][0] - cut.Z[cut.idx[4]][0]) > 1e-3,
  `${full.Z[3][0].toFixed(4)} → ${cut.Z[cut.idx[4]][0].toFixed(4)}`);
{
  const spec = site('semi-mask');
  const t = frameText(spec);
  ok('site: v₁의 변화가 캡션에 있다',
    t.includes(full.Z[0][0].toFixed(3)) && t.includes(cut.Z[cut.idx[1]][0].toFixed(3)));
  ok('site: 마스크는 행 삭제가 아니다', /행 선택이지 행 삭제가 아니다/.test(spec.caption));
}

/* ══ 8. 그림 명세 전반 규약 ════════════════════════════ */

section('명세 규약');
const ALL = Object.keys(NI3.figures);
// 17개다. 계보 스트립은 한 자리에만 선다 — 같은 여섯 프레임을 두 문서에서
// 다시 그리던 lineage-bridge는 삭제했다. 02의 'spectral' 한 장은 05의 아홉 장으로
// 갈라졌고(8 − 1 + 9 = 16), 05 S3의 spec-recap 한 장이 뒤에 붙었다(16 + 1 = 17).
ok('그림 17개가 등록되어 있다', ALL.length === 17, ALL.join(', '));
let controls = 0;
for (const id of ALL) {
  const spec = site(id);
  ok(`${id}: 반증 문장이 있다`, typeof spec.falsify === 'string' && spec.falsify.length > 10);
  ok(`${id}: 캡션과 배지가 있다`, !!spec.caption && !!spec.badge);
  const fr = spec.frames({});
  ok(`${id}: 프레임이 2장 이상`, fr.length >= 2, `got ${fr.length}`);
  ok(`${id}: 모든 프레임에 title/desc/caption/viewBox`,
    fr.every((f) => f.title && f.desc && f.caption && Array.isArray(f.vb) && f.vb.length === 4));
  ok(`${id}: 같은 span 그룹 안에서 viewBox가 하나`,
    new Set(fr.filter((f) => f.span !== 'full').map((f) => f.vb.join(','))).size <= 1);
  if (spec.variant) controls++;
}
ok('컨트롤이 있는 그림은 계보 스트립 하나뿐 (그 외 0개)', controls === 1, `got ${controls}`);
ok('타이머·자동재생 API를 쓰지 않는다',
  ['registry.js', 'primitives.js', 'figures.js', 'mount.js'].every((f) => {
    const src = readFileSync(join(ROOT, 'docs/javascripts/gnn', f), 'utf8');
    return !/setInterval|setTimeout|requestAnimationFrame/.test(src);
  }));
// 계산된 값을 그림 파일에 베껴 적으면 그래프를 바꿨을 때 조용히 거짓말이 된다.
ok('그림 명세에 하드코딩된 4자리 이상 소수가 없다',
  !/\d\.\d{4,}/.test(
    readFileSync(join(ROOT, 'docs/javascripts/gnn/figures.js'), 'utf8')
  ));

/* ══ 8b. 렌더 탐침 — 실제 노드 트리의 기하 ═════════════ */

section('렌더 탐침 (최소 DOM)');
let softTotal = 0;
for (const id of ALL) {
  let geo = null;
  let over = null;
  try {
    // 계약이 있으면 그 그림의 safeArea를 쓰고, 없으면 LAYOUT의 값을 쓴다.
    const con = site(id).contract;
    const safe = con && con.frames && con.frames.safeArea != null
      ? con.frames.safeArea : SAFE_AREA;
    geo = overflows(id, safe);
    over = overlaps(id);
  } catch (err) {
    ok(`${id}: 예외 없이 렌더된다`, false, String(err && err.message));
    continue;
  }
  ok(`${id}: 예외 없이 렌더된다`, true);
  ok(`${id}: 글자와 면 도형이 viewBox 안에 엄격히 들어간다`,
    geo.bad.length === 0, geo.bad.slice(0, 3).join(' | '));
  ok(`${id}: 글자가 다른 요소와 겹치지 않는다`,
    over.length === 0, over.slice(0, 3).join(' | '));
  softTotal += geo.soft.length;
  for (const s of geo.soft.slice(0, 2)) warn(`${id}: 안전 여백`, s);
  if (geo.soft.length > 2) warn(`${id}: 안전 여백`, `그 밖에 ${geo.soft.length - 2}건 더`);
}
console.log(`  안전 여백(${SAFE_AREA}px) 잠식 ${softTotal}건 — 실패로 세지 않는다.`);
{
  const { fig, frames } = render('state-transition');
  ok('figure 껍데기: figcaption이 있다',
    fig.children.some((c) => c.tagName === 'figcaption'));
  ok('프레임마다 <title>/<desc>와 aria-labelledby가 붙는다',
    frames.every((f) =>
      f.svg.attrs['aria-labelledby'] &&
      f.svg.children.some((c) => c.tagName === 'title' && c.textContent) &&
      f.svg.children.some((c) => c.tagName === 'desc' && c.textContent)));
  ok('상태 전이 그림에는 조작부가 없다',
    !fig.children.some((c) => (c.attrs['class'] || '').includes('gnn-fig__controls')));
  // 되먹임 고리는 문장이 아니라 선이어야 한다.
  const paths = frames.flatMap((f) =>
    f.items.filter(({ el }) => el.tagName === 'path' && (el.attrs.d || '').split('L').length >= 4));
  ok('인계 프레임에 되먹임 경로(꺾인 선)가 그려져 있다', paths.length >= 1);
}
{
  const frames = render('lineage-strip').frames;
  const loops = frames.flatMap((f) =>
    f.items.filter(({ el }) => el.tagName === 'path' && (el.attrs.d || '').split('L').length >= 4));
  ok('계보 스트립 마지막 칸에도 되먹임 경로가 있다', loops.length >= 1, `got ${loops.length}`);
}
{
  const frames = render('aggregate-collide').frames;
  // 충돌은 그림에서 "두 화살이 한 칸으로 모이는 것"으로 보여야 한다.
  let converged = 0;
  for (const f of frames) {
    const lines = f.items
      .filter(({ el }) => (el.attrs['class'] || '') === 'gnn-flow__line' && el.attrs.x2)
      .map(({ el }) => `${el.attrs.x2},${el.attrs.y2}`);
    const seen = new Set();
    for (const p of lines) {
      if (seen.has(p)) converged++;
      seen.add(p);
    }
  }
  ok('집계 그림에서 화살이 한 점으로 모이는 자리가 4곳', converged === 4, `got ${converged}`);
}

/* ══ 9. 본문·무JS 폴백 문구 ════════════════════════════ */

section('본문과 무JS 폴백');
const md = (f) => readFileSync(join(ROOT, 'docs', f), 'utf8');
// 통합 전 단계에서 05가 아직 없을 수 있다. 그때도 조용히 건너뛰지 않는다 —
// 빈 문자열을 넣어 05 관련 단언이 전부 FAIL로 남게 하고, 원인을 한 줄로 알린다.
const mdSoft = (f) => {
  try {
    return md(f);
  } catch (err) {
    console.error(`  MISSING  docs/${f} — 이 파일을 쓰는 검사는 전부 실패로 남는다`);
    return '';
  }
};
const D = {
  idx: md('index.md'),
  d01: md('01_gnn_gentle_guide.md'),
  d02: md('02_kipf2017_gcn_guide.md'),
  d03: md('03_bridge_mlp_to_gcn.md'),
  d04: md('04_exercises.md'),
  d05: mdSoft('05_spectral_bridge.md')
};

// 동결 앵커 — 이전 릴리스의 외부 링크가 깨지면 안 된다.
ok('앵커 #viz-message-passing 동결', D.d01.includes('{ #viz-message-passing }'));
ok('앵커 #viz-normalization 동결', D.d02.includes('{ #viz-normalization }'));
ok('앵커 #receptive-field 동결', D.d03.includes('{ #receptive-field }'));

// 폴백 문장의 숫자가 위에서 계산한 값과 같은가.
ok('01 폴백 (A+I)x = (6, 7, 4, 6)', D.d01.includes('(6, 7, 4, 6)'));
ok('01 §5.4 본문이 상태 전이 어휘를 쓴다',
  ['h_i^{(l)}', 'm_i^{(l)}', 'h_i^{(l+1)}', 'H^{(l+1)}'].every((s) => D.d01.includes(s)));
ok('01 §5.4 본문이 다음 층 재입력을 말한다', /다음 층의 입력/.test(D.d01));
ok('01 §5.4 본문에 깊이·너비·크기·병렬 확장 설명이 있다',
  ['깊이', '너비', '병렬'].every((s) => D.d01.includes(s)) && /O\(\|E\|/.test(D.d01));
ok('01 §6 폴백에 두 다중집합 사례가 있다',
  D.d01.includes('{1, 1, 1}') && D.d01.includes('{2, 2}'));
ok('01 §6이 표가 아니라 그림에 논지를 싣는다고 말한다',
  /표는 요약/.test(D.d01));
ok('02 폴백 raw 출력', D.d02.includes('(17, 7, 4, 6, 6, 7)'));
ok('02 폴백 mean 출력', D.d02.includes('(3.40, 2.33, 2.00, 3.00, 3.00, 3.50)'));
ok('02 폴백 sym 행 합', D.d02.includes('(1.41, 1.00, 0.82, 0.91, 0.82, 0.82)'));
ok('02 폴백 수렴 극한', D.d02.includes('(2.615, 2.615, 2.135, 2.135)'));
ok('05 폴백 spec(L) = 0, 0.50, 1.50, 2.00', D.d05.includes('0, 0.50, 1.50, 2.00'));
ok('03 폴백 k=3 기여 순위', D.d03.includes('v4 = 0.056'));
ok('04 해설 7의 1/18', D.d04.includes('\\tfrac1{18}'));

// 모든 그림 슬롯에 무JS 폴백이 붙어 있는가.
// id에는 숫자가 들어간다(norm-3up). 문자만 받는 문자 클래스를 쓰면 그 슬롯이
// 조용히 누락되고 "슬롯이 폴백보다 하나 적다"는 엉뚱한 실패로 나타난다.
const ALL_MD = Object.values(D).join('\n');
const slots = (ALL_MD.match(/data-gnn-fig="[a-z0-9-]+"/g) || [])
  .map((s) => s.slice('data-gnn-fig="'.length, -1));
const fbs = ALL_MD.match(/class="gnn-fallback"/g) || [];
ok('슬롯 수 = 등록된 그림 수', slots.length === ALL.length,
  `slots ${slots.length} [${slots.join(', ')}], figures ${ALL.length}`);
// 개수만 세면 id 오타가 통과한다. 등록부와 마크업을 id 단위로 맞춘다.
for (const id of ALL) {
  ok(`${id}: 마크업에 슬롯이 정확히 하나`,
    slots.filter((s) => s === id).length === 1,
    `found ${slots.filter((s) => s === id).length}`);
}
ok('슬롯마다 무JS 폴백이 하나씩', fbs.length === slots.length,
  `slots ${slots.length}, fallbacks ${fbs.length}`);
ok('렌더 성공 뒤에만 폴백을 감춘다',
  /렌더가 성공한 뒤에만/.test(readFileSync(join(ROOT, 'docs/javascripts/gnn/mount.js'), 'utf8')));

/* ══ 9b. 학습 경로의 구조 ══════════════════════════════
 *
 * 사실 오류가 아니라 순서와 정신모형의 파손을 잡는다. 여기 걸리는 것들은
 * "정확하지만 원문을 읽는 편이 빠른 상태"를 만들던 것들이다.
 */

section('학습 경로의 구조');

// (1) graph-in / graph-out 이 블록의 정의로 존재하는가.
ok('01에 graph-in/graph-out 정의 절이 있다', /\{ #graph-in-graph-out \}/.test(D.d01));
ok('01이 속성과 정점·간선 집합 기호를 구분해 graph-in/out을 쓴다',
  /\(X,E_f,u;\\,A\)\\;\\longmapsto\\;\(X',E_f',u';\\,A\)/.test(D.d01) &&
  /\$V,E\$는 정점·간선 \*\*집합\*\*/.test(D.d01));
ok('01이 연결 구조가 상수임을 말한다', /연결 구조는 출력이 아니라 상수/.test(D.d01));
ok('01이 MLP 대비 새 연산이 하나임을 말한다',
  /\{ #mlp-to-gnn \}/.test(D.d01) && /순서 불변 집계 \$\\rho\$/.test(D.d01));
ok('01이 고정 집계=GCN, 학습 집계=attention을 한 문장에 잇는다',
  /고정된 가중합\*\*으로 두면 GCN이고, 그 계수를 \*\*학습\*\*하면 attention/.test(D.d01));

// (2) head/readout 이 블록 정의 뒤에 온다. 순서가 뒤집히면 판정 1이 재발한다.
const iBlock = D.d01.indexOf('{ #graph-in-graph-out }');
const iHead = D.d01.indexOf('{ #head-readout }');
ok('01에 head/readout 절이 있다', iHead > 0);
ok('head 절이 블록 정의보다 뒤에 온다', iBlock > 0 && iHead > iBlock,
  `block ${iBlock}, head ${iHead}`);
ok('01이 예측 수준을 head의 차이로 설명한다',
  /\*\*블록은 세 경우에 대해 모두 같다\.\*\*/.test(D.d01));

// (3) Â의 정의가 계보 스트립 앞에 있어야 ④ 칸이 검산 가능해진다.
const iAhat = D.d01.indexOf('{ #a-hat');
const iStrip = D.d01.indexOf('data-gnn-fig="lineage-strip"');
ok('01이 Â를 스스로 정의한다', iAhat > 0 && /\\hat A=\\tilde D\^\{-1\/2\}\\tilde A\\tilde D\^\{-1\/2\}/.test(D.d01));
ok('Â 정의가 계보 스트립보다 앞에 있다', iAhat > 0 && iStrip > iAhat,
  `Â ${iAhat}, strip ${iStrip}`);
ok('01만 읽고 Â₁₃을 계산할 근거가 있다',
  D.d01.includes('\\frac1{\\sqrt6}') && /\\tilde d=\(3,3,2,2\)/.test(D.d01));
ok('01이 계보 ⑤의 두 행 일치를 랭크 1과 같은 투영값의 결합으로 설명한다',
  /랭크 1/.test(D.d01) && /\(t,-t\)/.test(D.d01) &&
  /랭크 1만으로 임의의 두 행이 같아지는 것은 아니다/.test(D.d01));

// (4) 정의되지 않은 기호가 그림 안에 남아 있으면 안 된다.
ok('01 §5.4 그림에 정의 없는 d̃ 라벨이 없다',
  !/d̃/.test(frameText(site('state-transition'))));
ok('01 §5.4 폴백도 d̃ 대신 셀 수 있는 말을 쓴다',
  !/차수는 d̃/.test(D.d01) && /송신자 수는 \(3, 3, 2, 2\)/.test(D.d01));

// (5) 렌더 파손 — 원시 LaTeX 노출.
const FIG_SRC = readFileSync(join(ROOT, 'docs/javascripts/gnn/figures.js'), 'utf8');
ok('JS가 주입하는 문자열에 $ 수식 구분자가 없다 (MathJax 대상 밖이다)',
  !/'[^']*\$[A-Za-z(\\][^']*'/.test(FIG_SRC));
for (const [name, src] of Object.entries(D)) {
  const headings = src.split('\n').filter((l) => /^#{1,6} /.test(l));
  ok(`${name}: 수식이 든 헤딩에 data-toc-label이 있다`,
    headings.every((l) => !l.includes('$') || l.includes('data-toc-label')),
    headings.filter((l) => l.includes('$') && !l.includes('data-toc-label')).join(' | '));
}
// 리스트 항목 안의 블록 수식은 4칸 들여써야 python-markdown이 리스트로 읽는다.
ok('index 학습 목표의 블록 수식이 리스트 안에 붙어 있다',
  /^\d\. GCN의 한 층\n\n {4}\$\$$/m.test(D.idx));

// (6) 같은 그림을 두 문서에서 다시 그리지 않는다.
ok('lineage-bridge 슬롯이 남아 있지 않다',
  !Object.values(D).some((s) => s.includes('lineage-bridge')));
ok('lineage-bridge 등록이 남아 있지 않다', !FIG_SRC.includes('lineage-bridge'));

// (7) 읽기 순서 01 → 03 → 02 → 04.
const NAVSRC = readFileSync(join(ROOT, 'mkdocs.yml'), 'utf8');
const navOrder = (NAVSRC.match(/0\d_[a-z0-9_]+\.md/g) || []);
ok('mkdocs nav 순서가 01 → 03 → 05 → 02 → 04',
  navOrder.join(',') === '01_gnn_gentle_guide.md,03_bridge_mlp_to_gcn.md,' +
    '05_spectral_bridge.md,02_kipf2017_gcn_guide.md,04_exercises.md', navOrder.join(','));
const idxOrder = (D.idx.match(/0\d_[a-z0-9_]+\.md(?=\))/g) || []);
const idxTable = idxOrder.slice(idxOrder.indexOf('01_gnn_gentle_guide.md'));
ok('index 권장 순서표도 01 → 03 → 05 → 02 → 04',
  /\| 1 \| \[01 /.test(D.idx) && /\| 2 \| \[03 /.test(D.idx) &&
  /\| 3 \| \[05 /.test(D.idx) && /\| 4 \| \[02 /.test(D.idx) &&
  /\| 5 \| \[04 /.test(D.idx), idxTable.join(','));
ok('index 첫 화면에 GNN의 상이 한 문장으로 있다',
  /\*\*GNN 블록은 그래프를 받아 같은 배선의 그래프를 돌려줍니다\.\*\*/.test(D.idx));
ok('정전의 뜻이 첫 등장에 풀려 있다', /정전\(正典, canonical/.test(D.idx));

/* (7b) 권장 읽기 순서표의 "그 문서의 그림" 칸이 그 문서의 그림을 하나도 빠뜨리지
 *      않는가. 그림을 새로 얹으면 슬롯과 폴백은 검사에 걸려 늘어나지만 색인 표는
 *      조용히 그대로 남는다 — 05 S3의 spec-recap이 실제로 그렇게 빠져 있었다.
 *      각 그림의 자리는 contract.anchor(그 슬롯 바로 앞 { #… } 헤딩)가 정본이다. */
{
  const byPage = new Map();
  for (const id of ALL) {
    const c = site(id).contract || {};
    if (!c.page || !c.anchor) continue;
    if (!byPage.has(c.page)) byPage.set(c.page, []);
    byPage.get(c.page).push({ id, anchor: c.anchor });
  }
  const rows = D.idx.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
  for (const [page, figs] of byPage) {
    const row = rows.find((l) => l.includes(`](${page})`));
    ok(`index 읽기 순서표에 ${page} 행이 있다`, !!row);
    if (!row) continue;
    const cells = row.split('|').map((s) => s.trim());
    const figCell = cells[cells.length - 2] || '';
    const missing = figs.filter((f) => !figCell.includes(`](${page}#${f.anchor})`));
    ok(`index ${page} 행의 그림 칸이 그 문서의 그림 앵커를 전부 건다`,
      missing.length === 0,
      missing.map((f) => `${f.id} → ${page}#${f.anchor}`).join(', '));
  }
}

// (8) 각 문서가 자기 역할을 머리에서 한 줄로 밝힌다.
for (const [name, src] of Object.entries(D)) {
  if (name === 'idx') continue;
  ok(`${name}: 머리에 이 문서의 역할 한 줄이 있다`,
    /^> \*\*이 문서(가|의)/m.test(src));
}

// (9) 03은 다리다. 01·02의 재방송이 아니라 Â의 구성이 단독 임무다.
ok('03이 Â 구성 절을 갖는다', /\{ #build-operator \}/.test(D.d03));
ok('03에서 중복 절이 빠졌다',
  !/#unlabeled-nodes/.test(D.d03) && !/#transductive/.test(D.d03) &&
  !/^## 확인문제$/m.test(D.d03));
ok('03의 고유 내용은 남아 있다',
  ['#weight-sharing', '#equivariance', '#receptive-field', '#edge-list', '#checklist']
    .every((a) => D.d03.includes(a)));
ok('03이 01·02보다 짧다', D.d03.length < D.d01.length && D.d03.length < D.d02.length,
  `03 ${D.d03.length}, 01 ${D.d01.length}, 02 ${D.d02.length}`);

// (10) 문서 간 링크가 살아 있는가 — 앵커까지 확인한다.
const FILES = { 'index.md': D.idx, '01_gnn_gentle_guide.md': D.d01,
  '02_kipf2017_gcn_guide.md': D.d02, '03_bridge_mlp_to_gcn.md': D.d03,
  '04_exercises.md': D.d04, '05_spectral_bridge.md': D.d05 };

/* ══ 9c. 05 폴백 문단의 손계산 대조 ════════════════════
 *
 * 같은 파일 안에서 k = 1, 2, 8은 맞고 k = 4만 틀렸던 전사 오류가 실제로 났다.
 * 폴백이 접근성 정본이므로 본문 숫자도 여기서 다시 센다.
 */
for (const [k, want] of [[1, [2.22, 2.63, 1.91, 2.82]], [2, [2.40, 2.77, 1.86, 2.48]],
                         [4, [2.52, 2.71, 1.97, 2.30]], [8, [2.59, 2.64, 2.09, 2.18]]]) {
  // 반올림 전 값으로 대조한다. toFixed(2) 결과끼리 비교하면 항등 검사가 된다.
  const raw = flat(mul(pow(G4.Ahat, k), colOf(x4)));
  nearArr(`Â^${k}x`, raw, want, 5e-3);
  const got = raw.map((v) => v.toFixed(2));
  ok(`05 폴백 Â^${k}x`, D.d05.includes('(' + got.join(', ') + ')'), got.join(', '));
}
// (I+S)^k 계열도 Â^k와 같은 삼중 대조에 넣는다. 본문·폴백에만 있고 검증이 없던 계열이다.
for (const [k, want] of [[4, [40.29, 44.36, 27.20, 32.96]],
                         [8, [668.1, 688.7, 465.1, 494.3]]]) {
  const raw = flat(mul(pow(G4.Iplus, k), colOf(x4)));
  nearArr(`(I+S)^${k}x`, raw, want, 5e-2);
  // 경로 C — I+S = 2I−L 이므로 (I+S)^k x = Σ (2−λ_j)^k c_j u_j 다.
  const cf = eigL.values.map((l, j) => Math.pow(2 - l, k) * c[j]);
  nearArr(`(I+S)^${k}x 닫힌 형태`, raw,
    [0, 1, 2, 3].map((i) => cf.reduce((s, t, j) => s + t * eigL.vectors[j][i], 0)), 1e-6);
}
ok('05 폴백 (I+S)⁸x', D.d05.includes('668.1') && D.d05.includes('494.3'));
ok('05가 √6 상수를 그림이 아니라 본문에서만 쓴다', !/Math\.sqrt\(6\)/.test(FIG_SRC));
function anchorsOf(src) {
  const set = new Set();
  for (const m of src.matchAll(/\{ *#([a-z0-9-]+)/g)) set.add(m[1]);
  for (const m of src.matchAll(/data-gnn-fig="([a-z0-9-]+)"/g)) set.add(m[1]);
  return set;
}
const ANCH = Object.fromEntries(
  Object.entries(FILES).map(([f, s]) => [f, anchorsOf(s)]));
let dead = [];
for (const [f, src] of Object.entries(FILES)) {
  for (const m of src.matchAll(/\]\(([0-9a-z_]*\.md)?#([a-z0-9-]+)\)/g)) {
    const target = m[1] || f;
    if (!ANCH[target] || !ANCH[target].has(m[2])) dead.push(`${f} → ${target}#${m[2]}`);
  }
}
ok('문서 간 앵커 링크에 끊어진 것이 없다', dead.length === 0, dead.join(' | '));

// 일정·역할·타임박스는 남아 있으면 안 된다.
const noMeeting = ['00_meeting', '진행표', '역할 회전', '체크포인트', '산출물 템플릿', '진행자 노트'];
for (const w of noMeeting) {
  ok(`문서에 "${w}" 가 남아 있지 않다`,
    !Object.values(D).some((s) => s.includes(w)));
}

/* ══ 10. 배치 토큰 (LAYOUT) ════════════════════════════
 *
 * 프레임 기하는 registry.js의 NI3.LAYOUT 하나에서만 나온다. 그림(primitives),
 * 마운트(mount), 스타일시트(extra.css)가 같은 표를 읽는지 여기서 확인한다.
 * 어긋난 값은 좁은 화면에서만 드러나므로 사람 눈으로는 늦게 잡힌다.
 */

section('배치 토큰 (LAYOUT)');
{
  const L = NI3.LAYOUT;
  ok('registry.js가 NI3.LAYOUT을 내보낸다',
    !!L && !!L.frame && Array.isArray(L.legacyWidths) && Array.isArray(L.spans));

  const presetW = Object.values(L.frame).map((f) => f.w);
  const allowed = new Set([...presetW, ...L.legacyWidths]);

  // 그림이 실제로 쓰는 프레임을 전부 편다. 변종이 있으면 변종 상태까지 돈다.
  const allFrames = [];
  for (const id of ALL) {
    const spec = site(id);
    const states = spec.variant
      ? spec.variant.options.map((o) => ({ [spec.variant.name]: o.value }))
      : [{}];
    for (const st of states) for (const f of spec.frames(st)) allFrames.push({ id, f });
  }

  const badW = [...new Set(allFrames
    .filter(({ f }) => !allowed.has(f.vb[2]))
    .map(({ id, f }) => `${id} ${f.vb[2]}`))];
  ok('모든 프레임 폭이 프리셋 ∪ legacyWidths 안에 있다', badW.length === 0, badW.join(', '));

  const badSpan = [...new Set(allFrames
    .filter(({ f }) => f.span != null && !L.spans.includes(f.span))
    .map(({ id, f }) => `${id} span=${f.span}`))];
  ok('모든 프레임 span이 LAYOUT.spans 안에 있다 (없으면 auto)',
    badSpan.length === 0, badSpan.join(', '));

  const maxW = Math.max(...allFrames.map(({ f }) => f.vb[2]), ...presetW);
  ok(`minStageWidth ≥ 최대 프레임 폭 + 2 (${maxW} + 2)`,
    L.minStageWidth >= maxW + 2, `minStageWidth ${L.minStageWidth}`);
  ok('minStageWidth는 프리셋·legacyWidths에서만 계산된다',
    L.minStageWidth === Math.max(...presetW, ...L.legacyWidths) + 2,
    `got ${L.minStageWidth}`);

  // 스타일시트가 그 값을 실제로 받아 쓰는가 — 상수를 베껴 적으면 곧 어긋난다.
  ok('extra.css가 --gnn-stage-min을 쓴다', CSS.includes('var(--gnn-stage-min'));
  ok('extra.css에 맨몸 min-width: 470px이 남아 있지 않다', !/min-width:\s*470px/.test(CSS));
  ok('mount.js가 --gnn-stage-min을 내보낸다',
    readFileSync(join(ROOT, 'docs/javascripts/gnn/mount.js'), 'utf8')
      .includes('--gnn-stage-min'));

  // 그림 글자가 하한 밑으로 내려가면 축소된 프레임에서 읽히지 않는다.
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const small = [];
  for (const rule of bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (!rule[1].includes('.gnn-')) continue;
    for (const d of rule[2].matchAll(/font-size:\s*([\d.]+)px/g)) {
      if (parseFloat(d[1]) < L.font.floor) small.push(`${rule[1].trim()} → ${d[1]}px`);
    }
  }
  ok(`.gnn-* font-size는 전부 ${L.font.floor}px 이상`, small.length === 0, small.join(' | '));
}

/* ══ 수식 저작 규칙 (mathLint) ═════════════════════════
 *
 * 인라인 수식은 글줄의 일부다. 글줄보다 긴 인라인 수식은 CSS로 스크롤
 * 상자를 만들어 줘도 읽히지 않는다 — 애초에 디스플레이($$…$$)로 써야 한다.
 * 그래서 이 문제는 스타일시트가 아니라 원고에서 잡는다.
 *
 * 글리프 수는 렌더된 폭의 대용물이다. 간격 명령(\!, \quad, \displaystyle …)과
 * 중괄호·첨자 기호는 폭을 만들지 않으므로 지우고, 매크로 하나는 글리프
 * 하나로, 분수는 한 칸, √는 두 칸으로 환산한 뒤 남은 코드 포인트를 센다.
 * 390px 화면의 본문 열이 대략 36글리프다.
 *
 * 줄 끝에 <!-- mathlint: allow --> 를 달면 그 줄은 건너뛴다. 근사 규칙이
 * 실물 폭을 잘못 재는 경우(예: smallmatrix)를 위한 탈출구다.
 */

section('수식 저작 규칙 (mathLint)');
{
  const FAIL_AT = 36;
  const WARN_AT = 28;

  /** 렌더 폭의 대용물. 매크로를 글리프 수로 환산한 뒤 남은 코드 포인트를 센다. */
  const glyphs = (tex) => [...tex
    .replace(/\\(?:left|right|quad|qquad|displaystyle|limits)\b/g, '')
    .replace(/\\[!,;: ]/g, '')
    .replace(/\\operatorname\b/g, '')
    .replace(/\\sqrt\b/g, '')
    .replace(/\\(?:frac|tfrac|dfrac)\b/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/\\[^a-zA-Z]/g, '')
    .replace(/[{}_^]/g, '')].length;

  /** 한 문서의 인라인 $…$ 를 모은다. 코드 펜스와 $$…$$ 블록은 대상이 아니다. */
  const inlineMath = (src) => {
    const out = [];
    let fence = false;
    let display = false;
    src.split('\n').forEach((raw, i) => {
      const t = raw.trim();
      if (/^(```|~~~)/.test(t)) { fence = !fence; return; }
      if (fence) return;
      if (t === '$$') { display = !display; return; }
      if (display) return;
      if (/<!--\s*mathlint:\s*allow\b/.test(raw)) return;  // 뒤에 사유를 적어도 된다
      const line = raw
        .replace(/`[^`]*`/g, '')          // 인라인 코드 스팬
        .replace(/\\\$/g, '')             // 이스케이프된 달러
        .replace(/\$\$[^$]*\$\$/g, '');   // 한 줄로 쓴 디스플레이
      for (const m of line.matchAll(/\$([^$\n]+)\$/g)) out.push({ line: i + 1, tex: m[1] });
    });
    return out;
  };

  let over = 0;
  let near28 = 0;
  let scanned = 0;
  for (const f of readdirSync(join(ROOT, 'docs')).filter((n) => n.endsWith('.md')).sort()) {
    for (const { line, tex } of inlineMath(readFileSync(join(ROOT, 'docs', f), 'utf8'))) {
      scanned++;
      const g = glyphs(tex);
      if (g >= FAIL_AT) {
        over++;
        ok(`docs/${f}:${line} 인라인 ${g}글리프 — $$…$$로 내려야 한다`, false, `$${tex}$`);
      } else if (g >= WARN_AT) {
        near28++;
        warn(`docs/${f}:${line} 인라인 ${g}글리프 (FAIL 기준 ${FAIL_AT})`, `$${tex}$`);
      }
    }
  }
  // 위반은 이미 한 줄에 하나씩 FAIL로 셌다. 합계까지 다시 세면 실패가 겹친다.
  if (over === 0) ok(`인라인 수식 ${scanned}개가 전부 ${FAIL_AT}글리프 미만`, true);
  console.log(`  인라인 수식 ${scanned}개 · FAIL ${over} · WARN ${near28} (누적 WARN ${warnings})`);
}

/* ══════════════════════════════════════════════════════════
 * == 그림 계약 (contract) ==
 *
 * 그림 하나하나가 자기 자리·자기 데이터·자기 어휘·자기 폴백을 스스로 선언한다.
 * 선언이 없으면 그림과 본문은 사람 눈으로만 이어져 있고, 한쪽을 고칠 때
 * 다른 쪽이 조용히 어긋난다. 그래서 선언은 선택이 아니라 필수다.
 *
 *   contract = {
 *     page, slot(기본 id), anchor?,
 *     data:   { graphs: [등록부 키], ops: [gr.ops() 출력의 이름] },
 *     frames: { count, countByState?, preset, span: [...], safeArea? },
 *     primitives: [api에서 부를 수 있는 원시형],
 *     text:   { maxChars: { heading, note, caption } },
 *     fallback: { declaresFrameCount, numbers, mustMention, mustNotMention }
 *   }
 * ════════════════════════════════════════════════════════ */

section('그림 계약 (contract)');
{
  /** 문서 원문. 없는 파일은 null로 두고, 그것을 쓰는 단언이 전부 실패하게 둔다. */
  const PAGE = {};
  const pageOf = (file) => {
    if (!(file in PAGE)) {
      try { PAGE[file] = readFileSync(join(ROOT, 'docs', file), 'utf8'); }
      catch { PAGE[file] = null; }
    }
    return PAGE[file];
  };

  const initialState = (spec) =>
    spec.variant ? { [spec.variant.name]: spec.variant.initial } : {};
  const statesOf = (spec) => (spec.variant
    ? spec.variant.options.map((o) => ({ key: String(o.value), state: { [spec.variant.name]: o.value } }))
    : []);
  const cps = (s) => [...String(s == null ? '' : s)].length;

  /** 슬롯 <div> 안의 무JS 폴백 문단만 꺼낸다. 문서 전체를 훑으면 옆 그림 것을 집는다. */
  function fallbackOf(src, slot) {
    const i = src.indexOf(`data-gnn-fig="${slot}"`);
    if (i < 0) return null;
    const end = src.indexOf('</div>', i);
    const block = src.slice(i, end < 0 ? src.length : end);
    const m = /<p class="gnn-fallback">([\s\S]*?)<\/p>/.exec(block);
    return m ? m[1] : null;
  }

  /* ── 1. 계약 자체 ──────────────────────────────────── */
  function checkContract(spec) {
    const id = spec.id;
    const c = spec.contract;
    if (!c) {
      ok(`${id}: contract 블록이 있다`, false, 'contract 없음');
      return null;
    }
    ok(`${id}: contract 블록이 있다`, true);

    const slot = c.slot || id;
    const F = c.frames || {};
    const fr = spec.frames(initialState(spec));

    ok(`${id}: frames.count가 실제 프레임 수와 같다`,
      F.count === fr.length, `계약 ${F.count}, 실제 ${fr.length}`);

    // 변종 그림은 상태마다 프레임 수가 달라질 수 있다. 상태 API로 직접 센다.
    const cbs = F.countByState;
    if (spec.variant) {
      ok(`${id}: 변종 그림은 countByState를 갖는다`, !!cbs, 'countByState 없음');
      if (cbs) {
        for (const { key, state } of statesOf(spec)) {
          const n = spec.frames(state).length;
          ok(`${id}: countByState.${key}가 실제와 같다`,
            cbs[key] === n, `계약 ${cbs[key]}, 실제 ${n}`);
        }
        const known = statesOf(spec).map((s) => s.key);
        const extra = Object.keys(cbs).filter((k) => !known.includes(k));
        ok(`${id}: countByState에 없는 상태가 섞여 있지 않다`,
          extra.length === 0, extra.join(', '));
      }
    } else {
      ok(`${id}: 변종이 아니면 countByState를 두지 않는다`, cbs == null);
    }

    const span = Array.isArray(F.span) ? F.span : null;
    ok(`${id}: frames.span 길이 = frames.count`,
      !!span && span.length === F.count,
      span ? `span ${span.length}, count ${F.count}` : 'span 배열 없음');
    if (span) {
      const wrong = fr
        .map((f, i) => ({ i, got: f.span == null ? 'auto' : f.span, want: span[i] }))
        .filter((r) => r.got !== r.want);
      ok(`${id}: 프레임마다 span이 계약과 같다 (없으면 auto)`,
        wrong.length === 0,
        wrong.map((r) => `f${r.i} 실제 ${r.got} ≠ 계약 ${r.want}`).join(', '));
      const odd = span.filter((s) => !SPANS.includes(s));
      ok(`${id}: 계약의 span 값이 LAYOUT.spans 안에 있다`, odd.length === 0, odd.join(', '));
    }

    // 데이터 출처 — 등록부에 없는 그래프나 연산자를 적으면 그림이 상수를 품는다.
    const data = c.data || {};
    const gs = Array.isArray(data.graphs) ? data.graphs : [];
    const noGraph = gs.filter((k) => !(k in NI3.graphs));
    ok(`${id}: data.graphs가 전부 NI3.graphs에 있다`, noGraph.length === 0, noGraph.join(', '));
    const base = (gs.filter((k) => NI3.graphs[k]).length ? gs.filter((k) => NI3.graphs[k]) : ['G4'])
      .map((k) => NI3.gr.ops(NI3.graphs[k]));
    const opNames = Array.isArray(data.ops) ? data.ops : [];
    const noOp = opNames.filter((n) => base.some((o) => !(n in o)));
    ok(`${id}: data.ops가 전부 gr.ops() 출력에 있다`, noOp.length === 0, noOp.join(', '));

    // 자리 — 문서·슬롯·앵커가 실제로 있는가.
    const src = c.page ? pageOf(c.page) : null;
    ok(`${id}: contract.page가 docs/에 있다`, !!src, `docs/${c.page}`);
    if (src) {
      ok(`${id}: 그 문서에 슬롯 data-gnn-fig="${slot}"이 있다`,
        src.includes(`data-gnn-fig="${slot}"`));
      if (c.anchor) {
        ok(`${id}: 앵커 { #${c.anchor} 가 그 문서에 있다`, src.includes(`{ #${c.anchor}`));
      }
    }
    return { c, slot, src, fr };
  }

  /* ── 2. 원시형 허용 목록 ───────────────────────────── */
  function callsOf(spec) {
    const calls = new Set();
    render(spec.id, calls);                       // 초기 상태
    // 변종은 다른 상태에서 다른 원시형을 부를 수 있다. 나머지 상태도 직접 그린다.
    if (spec.variant && API_SAMPLE) {
      for (const { state } of statesOf(spec)) {
        const root = sandbox.document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (const f of spec.frames(state)) f.draw(root, wrapApi(API_SAMPLE, calls));
      }
    }
    return [...calls].sort();
  }

  function checkPrimitives(spec, used, ctx) {
    const id = spec.id;
    const declared = Array.isArray(ctx.c.primitives) ? ctx.c.primitives : null;
    ok(`${id}: contract.primitives 목록이 있다`, !!declared, 'primitives 없음');
    if (!declared) return;
    const outside = used.filter((k) => !declared.includes(k));
    ok(`${id}: 계약에 없는 원시형을 부르지 않는다`, outside.length === 0,
      `초과 [${outside.join(', ')}] · 실제로 부른 것 [${used.join(', ')}] · ` +
      `계약 [${declared.join(', ')}]`);
    const unknown = declared.filter((k) => !UNIVERSE.includes(k));
    ok(`${id}: 계약의 원시형 이름이 api에 실제로 있다`, unknown.length === 0, unknown.join(', '));
  }

  /* ── 4a. 무JS 폴백 ─────────────────────────────────── */
  function checkFallback(spec, ctx) {
    const id = spec.id;
    const fb = ctx.c.fallback;
    ok(`${id}: contract.fallback 블록이 있다`, !!fb, 'fallback 없음');
    if (!fb) return;
    const p = ctx.src ? fallbackOf(ctx.src, ctx.slot) : null;
    ok(`${id}: 슬롯 안에 <p class="gnn-fallback">이 있다`, !!p);
    if (!p) return;

    const miss = (fb.numbers || []).filter((s) => !p.includes(s));
    ok(`${id}: 폴백에 계약된 숫자가 전부 있다`, miss.length === 0, miss.join(' | '));
    const say = (fb.mustMention || []).filter((s) => !p.includes(s));
    ok(`${id}: 폴백이 말해야 할 것을 말한다`, say.length === 0, say.join(' | '));
    const no = (fb.mustNotMention || []).filter((s) => p.includes(s));
    ok(`${id}: 폴백에 쓰면 안 되는 말이 없다`, no.length === 0, no.join(' | '));
    if (fb.declaresFrameCount) {
      const want = `정지 프레임 ${(ctx.c.frames || {}).count}장`;
      ok(`${id}: 폴백이 "${want}"을 밝힌다`, p.includes(want));
    }
  }

  /* ── 4b. 글자 길이 ─────────────────────────────────── */
  // 어느 클래스가 무엇인지는 primitives.js·figures.js가 실제로 붙이는 이름이다.
  //   heading — .gnn-frame__heading (프레임 제목) · .gnn-grid__heading (격자 제목)
  //   note    — .gnn-frame__note (프레임 안 주석)
  //   caption — frame.caption (프레임 밑 <p class="gnn-frame__cap">)
  const TEXT_CLASS = {
    heading: /\bgnn-frame__heading\b|\bgnn-grid__heading\b/,
    note: /\bgnn-frame__note\b/
  };

  function checkText(spec, ctx) {
    const id = spec.id;
    const max = (ctx.c.text || {}).maxChars;
    ok(`${id}: contract.text.maxChars가 있다`, !!max, 'text.maxChars 없음');
    if (!max) return;

    const worst = { heading: null, note: null, caption: null };
    const keep = (kind, n, k, s) => {
      if (!worst[kind] || n > worst[kind].n) worst[kind] = { n, k, s };
    };
    render(id).frames.forEach((fr, k) => {
      for (const { el } of fr.items) {
        if (el.tagName !== 'text') continue;
        const cl = CLS(el);
        for (const kind of ['heading', 'note']) {
          if (TEXT_CLASS[kind].test(cl)) keep(kind, cps(el.textContent), k, el.textContent);
        }
      }
    });
    ctx.fr.forEach((f, k) => keep('caption', cps(f.caption), k, f.caption));

    for (const kind of ['heading', 'note', 'caption']) {
      if (max[kind] == null) continue;
      const w = worst[kind];
      if (!w) { ok(`${id}: ${kind} 최대 ${max[kind]}자 (해당 글자 없음)`, true); continue; }
      ok(`${id}: ${kind} 최대 ${max[kind]}자`, w.n <= max[kind],
        `f${w.k} ${w.n}자 "${String(w.s).slice(0, 30)}…"`);
    }
  }

  /* ── 5. 그림마다 한 바퀴 ───────────────────────────── */
  render(ALL[0], new Set());                    // api 모양을 한 번 본다
  const UNIVERSE = API_SAMPLE
    ? Object.keys(API_SAMPLE).filter((k) => typeof API_SAMPLE[k] === 'function').sort()
    : [];
  console.log(`  api가 건네는 원시형 전체: ${UNIVERSE.join(', ')}`);
  const nonFn = API_SAMPLE
    ? Object.keys(API_SAMPLE).filter((k) => typeof API_SAMPLE[k] !== 'function').sort()
    : [];
  console.log(`  (호출이 아닌 값: ${nonFn.join(', ') || '없음'})`);
  ok('api에 계약이 모르는 원시형이 늘어나지 않았다',
    UNIVERSE.join(',') === ['S', 'drawAxis', 'drawBars', 'drawBlock', 'drawFeatureAxisFlow',
      'drawGraph', 'drawGrid', 'drawNodeAxisFlow'].sort().join(','),
    UNIVERSE.join(', '));

  const seen = [];
  for (const id of ALL) {
    const spec = site(id);
    const used = callsOf(spec);
    seen.push(`${id}: [${used.map((s) => `'${s}'`).join(', ')}]`);
    const ctx = checkContract(spec);
    if (!ctx) continue;                          // 계약이 없으면 나머지는 물을 것이 없다
    checkPrimitives(spec, used, ctx);
    checkFallback(spec, ctx);
    checkText(spec, ctx);
  }
  // 계약을 채워 넣는 동안만 나오는 안내다. 계약이 다 붙으면 이 줄은 사라진다.
  if (ALL.some((id) => !site(id).contract)) {
    console.log('  계약이 비어 있는 동안의 참고 — 그림이 실제로 부르는 원시형:');
    for (const line of seen) console.log(`    ${line}`);
  }
}

/* ── 결과 ─────────────────────────────────────────────── */

console.log(`\n${checks - failures}/${checks} 통과`);
if (warnings) console.log(`${warnings}건 경고${ARGS.warnAsError ? ' — --warn-as-error 이므로 실패로 센다' : ''}`);
if (skipped) console.log(`${skipped}건은 --only/--file 로 건너뛰었다`);
if (failures) {
  console.error(`${failures}건 실패`);
  process.exit(1);
}
if (ARGS.warnAsError && warnings) {
  console.error(`경고 ${warnings}건 — --warn-as-error`);
  process.exit(1);
}
