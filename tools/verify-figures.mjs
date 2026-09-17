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
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EPS = 5e-4;

let failures = 0;
let checks = 0;

function ok(name, cond, detail) {
  checks++;
  if (cond) return;
  failures++;
  console.error(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`);
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

const sandbox = { console, Math, Object, Array, String, Number, JSON, Infinity, isNaN };
sandbox.globalThis = sandbox;
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
nearArr('AX = (5,5,1,2)  [01 §7]', flat(mul(G4.A, colOf(x4))), [5, 5, 1, 2]);
nearArr('(A+I)X = (6,7,4,6)  [01 §5.4·§7]', flat(mul(G4.At, colOf(x4))), [6, 7, 4, 6]);
nearArr('ÂX ≈ (2.2247, 2.6330, 1.9082, 2.8165)  [02 §6]',
  flat(mul(G4.Ahat, colOf(x4))), [2.2247, 2.6330, 1.9082, 2.8165], 1e-3);
nearArr('ReLU(ÂXW), W=[2] ≈ (4.4495, 5.2660, 3.8165, 5.6330)  [02 §6]',
  flat(mul(G4.Ahat, colOf(x4))).map((v) => 2 * v),
  [4.4495, 5.2660, 3.8165, 5.6330], 1e-3);

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
  const t = frameText(site('lineage-strip'));
  ok('site: ⑤ 프레임에 W 기둥이 하나', /딱 하나/.test(t));
  ok('site: σ가 자르는 칸 수가 본문과 같다', t.includes('음수 ' + clipped + '칸'));
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
near('Â₁₃ = 1/√10 ≈ 0.316 (송신자 차수 5)', G4S.Ahat[0][2], 1 / Math.sqrt(10));
near('Â₂₄ = 1/√6 ≈ 0.408 (송신자 차수 3)', G4S.Ahat[1][3], 1 / S6);
ok('받는 쪽 차수가 같은데 계수가 다르다 — 송신자 차수 감쇠',
  G4S.dt[2] === G4S.dt[3] && Math.abs(G4S.Ahat[0][2] - G4S.Ahat[1][3]) > 0.09);
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

  const eig = NI3.la.jacobiEig(ops.L);
  const flips = eig.vectors.map((v) =>
    NI3.graphs.G4.edges.filter(([a, b]) => v[ops.idx[a]] * v[ops.idx[b]] < 0).length);
  nearArr('고유벡터의 부호 변화 = 0,1,2,3 (주파수 순서)', flips, [0, 1, 2, 3], 0);
  eig.vectors.forEach((v, k) => {
    const Lv = flat(mul(ops.L, colOf(v)));
    nearArr(`L u${k + 1} = λ${k + 1} u${k + 1}`, Lv, v.map((t) => t * eig.values[k]), 1e-8);
  });
}
{
  const t = frameText(site('spectral'));
  ok('site: (d)를 동치가 아니라고 명시', /동치 변형이 아니다/.test(t));
  ok('site: λ_max ≈ 2 를 근사로 표시', /근사/.test(t));
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
ok('그림 8개가 등록되어 있다', ALL.length === 8, ALL.join(', '));
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
ok('컨트롤이 있는 그림은 계보 스트립 둘뿐 (그 외 0개)', controls === 2, `got ${controls}`);
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

/* ══ 9. 본문·무JS 폴백 문구 ════════════════════════════ */

section('본문과 무JS 폴백');
const md = (f) => readFileSync(join(ROOT, 'docs', f), 'utf8');
const D = {
  idx: md('index.md'),
  d01: md('01_gnn_gentle_guide.md'),
  d02: md('02_kipf2017_gcn_guide.md'),
  d03: md('03_bridge_mlp_to_gcn.md'),
  d04: md('04_exercises.md')
};

// 동결 앵커 — 이전 릴리스의 외부 링크가 깨지면 안 된다.
ok('앵커 #viz-message-passing 동결', D.d01.includes('{ #viz-message-passing }'));
ok('앵커 #viz-normalization 동결', D.d02.includes('{ #viz-normalization }'));
ok('앵커 #receptive-field 동결', D.d03.includes('{ #receptive-field }'));

// 폴백 문장의 숫자가 위에서 계산한 값과 같은가.
ok('01 폴백 (A+I)x = (6, 7, 4, 6)', D.d01.includes('(6, 7, 4, 6)'));
ok('02 폴백 raw 출력', D.d02.includes('(17, 7, 4, 6, 6, 7)'));
ok('02 폴백 mean 출력', D.d02.includes('(3.40, 2.33, 2.00, 3.00, 3.00, 3.50)'));
ok('02 폴백 sym 행 합', D.d02.includes('(1.41, 1.00, 0.82, 0.91, 0.82, 0.82)'));
ok('02 폴백 수렴 극한', D.d02.includes('(2.615, 2.615, 2.135, 2.135)'));
ok('02 폴백 spec(L) = 0, 0.5, 1.5, 2', D.d02.includes('0, 0.5, 1.5, 2'));
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

// 일정·역할·타임박스는 남아 있으면 안 된다.
const noMeeting = ['00_meeting', '진행표', '역할 회전', '체크포인트', '산출물 템플릿', '진행자 노트'];
for (const w of noMeeting) {
  ok(`문서에 "${w}" 가 남아 있지 않다`,
    !Object.values(D).some((s) => s.includes(w)));
}

/* ── 결과 ─────────────────────────────────────────────── */

console.log(`\n${checks - failures}/${checks} 통과`);
if (failures) {
  console.error(`${failures}건 실패`);
  process.exit(1);
}
