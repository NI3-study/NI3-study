/*!
 * gnn/registry.js — NI3 GNN Study · 시각 계보 L0
 *
 * 그래프 등록부(좌표·간선·특성의 단일 진실)와 소형 조밀 선형대수 커널.
 * 그림 코드에는 수치 상수를 적지 않는다. 화면의 모든 숫자는 여기서 계산한다.
 *
 * 정전(canonical) 그래프는 G4 하나이며, 확장 그래프는 G4의 네 정점을
 * 좌표·번호·특성 그대로 유지한 채 정점을 "더하기만" 한다. 교체는 하지 않는다.
 */
(function (global) {
  'use strict';

  var NI3 = (global.NI3GNN = global.NI3GNN || {});

  /* ══ 선형대수 — 정점 수가 작은 예제 전용 조밀 구현 ══════════ */

  function zeros(n, m) {
    var A = [], i, j, row;
    for (i = 0; i < n; i++) {
      row = [];
      for (j = 0; j < m; j++) row.push(0);
      A.push(row);
    }
    return A;
  }

  function eye(n) {
    var A = zeros(n, n), i;
    for (i = 0; i < n; i++) A[i][i] = 1;
    return A;
  }

  function clone(A) {
    return A.map(function (r) { return r.slice(); });
  }

  function matmul(A, B) {
    var n = A.length, k = B.length, m = B[0].length;
    var C = zeros(n, m), i, j, p, s;
    for (i = 0; i < n; i++) {
      for (j = 0; j < m; j++) {
        s = 0;
        for (p = 0; p < k; p++) s += A[i][p] * B[p][j];
        C[i][j] = s;
      }
    }
    return C;
  }

  function matpow(A, k) {
    var R = eye(A.length), i;
    for (i = 0; i < k; i++) R = matmul(R, A);
    return R;
  }

  /** 같은 크기 행렬의 차 A − B. */
  function msub(A, B) {
    return A.map(function (r, i) {
      return r.map(function (v, j) { return v - B[i][j]; });
    });
  }

  /** 행렬의 스칼라배. */
  function mscale(A, s) {
    return A.map(function (r) {
      return r.map(function (v) { return v * s; });
    });
  }

  /** 행렬 × 벡터 → 벡터. */
  function matvec(A, v) {
    return A.map(function (r) {
      return r.reduce(function (a, t, j) { return a + t * v[j]; }, 0);
    });
  }

  /** 두 벡터의 내적. */
  function dot(u, v) {
    return u.reduce(function (a, t, i) { return a + t * v[i]; }, 0);
  }

  /**
   * Chebyshev 다항식 벌 [T₀(M), …, T_K(M)].
   * T₀ = I, T₁ = M, T_k = 2M T_{k-1} − T_{k-2}.
   */
  function cheby(M, K) {
    var out = [eye(M.length)];
    if (K >= 1) out.push(clone(M));
    for (var k = 2; k <= K; k++) {
      out.push(msub(mscale(matmul(M, out[k - 1]), 2), out[k - 2]));
    }
    return out;
  }

  /**
   * 약분판 표시 배율. 0이 아닌 성분 가운데 절댓값이 가장 작은 것을 1로 만든다.
   * '비영'의 기준은 jacobiEig의 부호 규약과 같은 1e-9다.
   */
  function vscale(u) {
    var m = Infinity;
    u.forEach(function (v) {
      var a = Math.abs(v);
      if (a > 1e-9 && a < m) m = a;
    });
    return m === Infinity ? 1 : 1 / m;
  }

  function rowSums(A) {
    return A.map(function (r) {
      return r.reduce(function (a, b) { return a + b; }, 0);
    });
  }

  /** diag(left) · A · diag(right) */
  function diagScale(A, left, right) {
    return A.map(function (row, i) {
      return row.map(function (v, j) { return left[i] * v * right[j]; });
    });
  }

  function relu(A) {
    return A.map(function (r) {
      return r.map(function (v) { return v > 0 ? v : 0; });
    });
  }

  function softmaxRows(A) {
    return A.map(function (r) {
      var mx = Math.max.apply(null, r);
      var ex = r.map(function (v) { return Math.exp(v - mx); });
      var s = ex.reduce(function (a, b) { return a + b; }, 0);
      return ex.map(function (v) { return v / s; });
    });
  }

  /**
   * 대칭 행렬의 고유분해 (순환 Jacobi).
   * 반환: { values: [오름차순], vectors: [vectors[k] = k번째 고유벡터] }
   *
   * vectors는 "열이 고유벡터인 행렬"이 아니다. 배열의 배열로 보면 k번째 행이
   * k번째 고유벡터이므로 그것이 곧 Uᵀ다. 따라서 c = Uᵀx 는 matmul(vectors, colMat(x))
   * 한 줄이고, U가 필요한 자리에서는 행/열을 바꿔 읽는다.
   */
  function jacobiEig(Ain) {
    var n = Ain.length, A = clone(Ain), V = eye(n);
    var sweep, i, j, k, off, theta, t, c, s, sgn;
    var aik, ajk, aki, akj, vki, vkj;

    for (sweep = 0; sweep < 100; sweep++) {
      off = 0;
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      }
      if (off < 1e-26) break;
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          if (Math.abs(A[i][j]) < 1e-18) continue;
          theta = (A[j][j] - A[i][i]) / (2 * A[i][j]);
          sgn = theta >= 0 ? 1 : -1;
          t = sgn / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          c = 1 / Math.sqrt(t * t + 1);
          s = t * c;
          for (k = 0; k < n; k++) {
            aik = A[i][k]; ajk = A[j][k];
            A[i][k] = c * aik - s * ajk;
            A[j][k] = s * aik + c * ajk;
          }
          for (k = 0; k < n; k++) {
            aki = A[k][i]; akj = A[k][j];
            A[k][i] = c * aki - s * akj;
            A[k][j] = s * aki + c * akj;
            vki = V[k][i]; vkj = V[k][j];
            V[k][i] = c * vki - s * vkj;
            V[k][j] = s * vki + c * vkj;
          }
        }
      }
    }

    var pairs = [];
    for (i = 0; i < n; i++) {
      var col = [];
      for (k = 0; k < n; k++) col.push(V[k][i]);
      // 부호 규약: 첫 비영 성분을 양수로 맞춘다.
      // 임계값 없이 col[0] < 0 으로 판정하면 첫 성분이 수치 잡음(1e-17)인
      // 고유벡터에서 부호가 무작위로 뒤집힌다. 기준은 vscale과 같은 1e-9다.
      var first = -1;
      for (k = 0; k < n; k++) {
        if (Math.abs(col[k]) > 1e-9) { first = k; break; }
      }
      if (first >= 0 && col[first] < 0) col = col.map(function (v) { return -v; });
      pairs.push({ value: A[i][i], vector: col });
    }
    pairs.sort(function (a, b) { return a.value - b.value; });
    return {
      values: pairs.map(function (p) { return p.value; }),
      vectors: pairs.map(function (p) { return p.vector; })
    };
  }

  /* ══ 그래프 유틸 ═══════════════════════════════════════════ */

  function neighbors(graph, id) {
    var out = [];
    graph.edges.forEach(function (e) {
      if (e[0] === id) out.push(e[1]);
      else if (e[1] === id) out.push(e[0]);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  /** 시작 정점에서의 hop 거리. 도달 불가는 Infinity. */
  function hopDistance(graph, start) {
    var dist = {}, queue = [start], head = 0, cur;
    graph.nodes.forEach(function (id) { dist[id] = Infinity; });
    dist[start] = 0;
    while (head < queue.length) {
      cur = queue[head++];
      neighbors(graph, cur).forEach(function (nb) {
        if (dist[nb] === Infinity) {
          dist[nb] = dist[cur] + 1;
          queue.push(nb);
        }
      });
    }
    return dist;
  }

  /** 정점 일부만 남긴 유도 부분그래프. 좌표·번호·특성은 그대로 이어받는다. */
  function subgraph(graph, keep) {
    var set = {};
    keep.forEach(function (id) { set[id] = true; });
    var g = {
      id: graph.id + '\\{' + graph.nodes.filter(function (id) { return !set[id]; }).join(',') + '}',
      label: graph.label,
      nodes: graph.nodes.filter(function (id) { return set[id]; }),
      pos: graph.pos,
      radius: graph.radius,
      viewBox: graph.viewBox,
      edges: graph.edges.filter(function (e) { return set[e[0]] && set[e[1]]; }),
      x: graph.x,
      X: graph.X
    };
    return g;
  }

  /** 행렬·차수·연산자 일체를 한 번만 계산해 그래프에 캐시한다. */
  function ops(graph) {
    if (graph._ops) return graph._ops;

    var ids = graph.nodes, n = ids.length, idx = {};
    ids.forEach(function (id, k) { idx[id] = k; });

    var A = zeros(n, n);
    graph.edges.forEach(function (e) {
      var a = idx[e[0]], b = idx[e[1]];
      A[a][b] = 1;
      A[b][a] = 1;
    });

    var At = A.map(function (r, i) {
      return r.map(function (v, j) { return i === j ? 1 : v; });
    });
    var d = rowSums(A);
    var dt = rowSums(At);
    var invSqrtT = dt.map(function (v) { return 1 / Math.sqrt(v); });
    var invSqrt = d.map(function (v) { return v > 0 ? 1 / Math.sqrt(v) : 0; });

    var Ssym = diagScale(A, invSqrt, invSqrt);              // D^-1/2 A D^-1/2
    var res = {
      idx: idx,
      n: n,
      ids: ids,
      A: A,
      At: At,                                               // Ã = A + I
      d: d,
      dt: dt,                                               // d̃
      Ahat: diagScale(At, invSqrtT, invSqrtT),              // Â = D̃^-1/2 Ã D̃^-1/2
      Amean: At.map(function (r, i) {                       // D̃^-1 Ã (행 평균)
        return r.map(function (v) { return v / dt[i]; });
      }),
      Ssym: Ssym,
      Iplus: Ssym.map(function (r, i) {                     // I + D^-1/2 A D^-1/2
        return r.map(function (v, j) { return i === j ? v + 1 : v; });
      }),
      L: Ssym.map(function (r, i) {                         // L = I − D^-1/2 A D^-1/2
        return r.map(function (v, j) { return (i === j ? 1 : 0) - v; });
      })
    };

    // λ_max — L의 가장 큰 고유값. G4처럼 양쪽으로 갈리는 그래프에서만 정확히 2다.
    res.lmax = jacobiEig(res.L).values[n - 1];
    // L̃ = (2/λ_max)L − I. 고유값을 [−1, 1] 안으로 눌러 넣은 판이며,
    // Ã = A + I 의 물결(자기 연결)과는 뜻이 다르다.
    res.Ltilde = msub(mscale(res.L, 2 / res.lmax), eye(n));

    graph._ops = res;
    return res;
  }

  /** 정점별 스칼라 특성을 N×1 행렬로. */
  function scalarX(graph) {
    return graph.nodes.map(function (id) { return [graph.x[id]]; });
  }

  /** 정점별 다채널 특성을 N×C 행렬로. */
  function featureX(graph) {
    return graph.nodes.map(function (id) { return graph.X[id].slice(); });
  }

  /* ══ 그래프 등록부 ═════════════════════════════════════════ */
  /*
   * 좌표는 사이트 전체에서 동결이다. G4의 네 정점은 확장 그래프에서도
   * 같은 좌표·같은 번호를 갖는다. 독자가 형태를 다시 읽지 않아도 되는 것이
   * 계보의 실질이다.
   */

  var G4 = {
    id: 'G4',
    label: 'G4',
    nodes: [1, 2, 3, 4],
    edges: [[1, 2], [1, 3], [2, 4]],
    pos: { 1: [86, 40], 2: [166, 40], 3: [34, 104], 4: [218, 104] },
    radius: 19,
    viewBox: [6, 12, 240, 136],
    x: { 1: 1, 2: 2, 3: 3, 4: 4 },
    X: { 1: [1, 0], 2: [0, 1], 3: [1, 1], 4: [2, 1] },
    source: '01 §8 · 02 §6 · 04 공통 그래프'
  };

  // G4★ — G4의 v1에 잎 v5, v6을 붙인 확장. d̃ = (5, 3, 2, 2, 2, 2).
  var G4star = {
    id: 'G4star',
    label: 'G4★',
    nodes: [1, 2, 3, 4, 5, 6],
    edges: [[1, 2], [1, 3], [2, 4], [1, 5], [1, 6]],
    pos: {
      1: [86, 40], 2: [166, 40], 3: [34, 104], 4: [218, 104],
      5: [120, 112], 6: [24, 22]
    },
    radius: 17,
    viewBox: [2, -2, 244, 152],
    x: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 },
    X: { 1: [1, 0], 2: [0, 1], 3: [1, 1], 4: [2, 1], 5: [0, 2], 6: [1, 2] },
    source: 'G4 확장 — 차수 격차를 만들기 위해 잎 2개를 더했다.'
  };

  // G4▲ — G4의 두 허브 v1, v2에 각각 잎 2개. 분기와 병목을 동시에 담는다.
  var G4tri = {
    id: 'G4tri',
    label: 'G4▲',
    nodes: [1, 2, 3, 4, 5, 6, 7, 8],
    edges: [[1, 2], [1, 3], [2, 4], [1, 5], [1, 6], [2, 7], [2, 8]],
    pos: {
      1: [86, 40], 2: [166, 40], 3: [34, 104], 4: [218, 104],
      5: [36, -6], 6: [108, -28], 7: [176, -28], 8: [244, 34]
    },
    radius: 16,
    viewBox: [10, -50, 256, 190],
    x: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8 },
    X: { 1: [1, 0], 2: [0, 1], 3: [1, 1], 4: [2, 1], 5: [0, 2], 6: [1, 2], 7: [2, 0], 8: [0, 0] },
    source: 'G4 확장 — 이웃 증가와 병목 간선을 동시에 담기 위한 최소 확장.'
  };

  // G4○ — G4를 5-사이클로 닫은 확장. λ_max가 정확히 2가 아닌 그래프.
  var G4circ = {
    id: 'G4circ',
    label: 'G4○',
    nodes: [1, 2, 3, 4, 5],
    edges: [[1, 2], [1, 3], [2, 4], [3, 5], [4, 5]],
    pos: {
      1: [86, 40], 2: [166, 40], 3: [34, 104], 4: [218, 104],
      5: [126, 150]
    },
    radius: 17,
    viewBox: [2, 12, 244, 178],
    x: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
    source: 'G4 확장 — λ_max가 정확히 2가 아닌 그래프를 만들기 위해 5-사이클로 닫았다.'
  };

  /* ══ 배치 등록부 ═══════════════════════════════════════════ */
  /*
   * 프레임 기하의 단일 진실. 폭·여백·글자 하한을 여기서만 정하고
   * primitives.js(그리기), mount.js(CSS 변수), tools/verify-figures.mjs(검사)가
   * 같은 표를 읽는다. 그림 파일이 제 폭을 스스로 정하면 무대 최소 폭과 어긋나고,
   * 어긋난 것은 좁은 화면에서만 드러나 눈에 잘 띄지 않는다.
   */

  // 새 그림이 고를 수 있는 프레임 폭. 높이는 그림이 정한다.
  var FRAME = {
    half: { w: 330 },   // 2열 배치 한 칸
    wide: { w: 452 },   // span:'full' 한 줄
    tall: { w: 260 },   // 세로로 긴 한 칸
    strip: { w: 204 }   // 계보 스트립의 작은 칸
  };

  // 기존 그림 전용. 새 그림은 frame 프리셋만 쓴다.
  var LEGACY_WIDTHS = [204, 250, 260, 330, 424, 446, 452, 466, 468];

  /** 프리셋과 기존 폭을 합친 최대 프레임 폭. */
  function maxFrameWidth() {
    var w = 0, k;
    for (k in FRAME) {
      if (Object.prototype.hasOwnProperty.call(FRAME, k)) w = Math.max(w, FRAME[k].w);
    }
    LEGACY_WIDTHS.forEach(function (v) { w = Math.max(w, v); });
    return w;
  }

  var LAYOUT = {
    frame: FRAME,
    legacyWidths: LEGACY_WIDTHS,
    safeArea: 6,                          // viewBox 가장자리에서 띄우는 최소 여백
    gap: { textText: 1.5 },               // 글자와 글자 사이 최소 간격
    spans: ['auto', 'full'],              // frame.span이 가질 수 있는 값 전부
    font: { floor: 9 },                   // 그림 글자 크기의 하한(px)
    cell: { sm: [24, 14], md: [36, 24], lg: [52, 24] },  // 칸(C) 크기 [w, h]
    ring: { pad: 8 },                     // 테(R)가 원반 바깥으로 더 무는 폭
    // 무대 최소 폭 = 가장 넓은 프레임 + 2. mount.js가 --gnn-stage-min으로 내보내고
    // extra.css가 그대로 쓴다. 배율이 1 밑으로 떨어지지 않게 하는 유일한 수치다.
    minStageWidth: maxFrameWidth() + 2
  };

  /* ══ 공개 ══════════════════════════════════════════════════ */

  NI3.la = {
    zeros: zeros, eye: eye, clone: clone, matmul: matmul, matpow: matpow,
    msub: msub, mscale: mscale, matvec: matvec, dot: dot,
    cheby: cheby, vscale: vscale,
    rowSums: rowSums, diagScale: diagScale, relu: relu,
    softmaxRows: softmaxRows, jacobiEig: jacobiEig
  };

  NI3.graphs = { G4: G4, G4star: G4star, G4tri: G4tri, G4circ: G4circ };

  NI3.LAYOUT = LAYOUT;

  NI3.gr = {
    ops: ops,
    neighbors: neighbors,
    hopDistance: hopDistance,
    subgraph: subgraph,
    scalarX: scalarX,
    featureX: featureX
  };
})(typeof window !== 'undefined' ? window : this);
