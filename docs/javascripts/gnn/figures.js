/*!
 * gnn/figures.js — NI3 GNN Study · 시각 계보 L2
 *
 * 그림은 코드가 아니라 선언 데이터다. 각 명세는
 *   { id, title, badge, caption, falsify, cols, variant?, frames(state) }
 * 이고 프레임은 { vb, title, desc, caption, span?, draw(root, api) } 이다.
 *
 * 숫자는 전부 registry.js가 그래프에서 계산한다. 여기에는 상수를 적지 않는다.
 * 기본은 정적이다. 프레임 스트립이 곧 슬라이더의 모든 위치이므로 슬라이더는 없다.
 */
(function (global) {
  'use strict';

  var NI3 = (global.NI3GNN = global.NI3GNN || {});
  var G = NI3.graphs, la = NI3.la, gr = NI3.gr, px = NI3.px;
  var fx = px.fx, fs = px.fs, sub = px.sub;

  /* ── 표기 헬퍼 ─────────────────────────────────────────── */

  var MINUS = '−';

  /** 계약이 적는 안전 여백. 정본은 registry.js의 NI3.LAYOUT.safeArea 하나다. */
  var SAFE = (NI3.LAYOUT && NI3.LAYOUT.safeArea != null) ? NI3.LAYOUT.safeArea : 6;

  function num(v, d) { return fx(v, d).replace('-', MINUS); }

  /** 원반 안에 들어갈 짧은 3자리 표기 (.056 / .347). */
  function dot3(v) {
    var s = v.toFixed(3);
    // 반올림해서 0이면 부호를 떼어 −.000 이 찍히지 않게 한다.
    if (/^-0\.?0*$/.test(s)) s = s.slice(1);
    if (s.indexOf('0.') === 0) return s.slice(1);
    if (s.indexOf('-0.') === 0) return MINUS + s.slice(2);
    return s.replace('-', MINUS);
  }

  var SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

  /** 위첨자 표기 — (Lᵏ) 처럼 거듭제곱을 글자로 적는다. */
  function sup(n) {
    return String(n).split('').map(function (c) {
      return SUP[+c] != null ? SUP[+c] : c;
    }).join('');
  }

  /** 세는 말 — "막대가 2이다"가 아니라 "막대가 둘이다"로 적는다. */
  var COUNT_KO = ['영', '하나', '둘', '셋', '넷', '다섯'];
  function countKo(n) { return COUNT_KO[n] != null ? COUNT_KO[n] : String(n) + '개'; }

  function vlab(id) { return 'v' + sub(id); }
  function colMat(v) { return v.map(function (t) { return [t]; }); }
  function flat(M) { return M.map(function (r) { return r[0]; }); }
  function textMat(M, d) {
    return M.map(function (r) {
      return r.map(function (v) { return num(v, d); });
    });
  }
  function rowLabelsOf(g) { return g.nodes.map(vlab); }
  function idsOf(g) { return g.nodes.slice(); }

  /** 그래프를 프레임 안에서 평행이동해 그린다. 좌표 자체는 절대 바꾸지 않는다. */
  function placed(root, api, dx, dy) {
    return api.S('g', { transform: 'translate(' + dx + ',' + dy + ')' }, root);
  }

  function heading(root, api, text, x, y) {
    api.S('text', {
      'class': 'gnn-frame__heading', x: x == null ? 14 : x, y: y == null ? 18 : y,
      text: text
    }, root);
  }

  function note(root, api, text, x, y) {
    api.S('text', { 'class': 'gnn-frame__note', x: x, y: y, text: text }, root);
  }

  /* ══════════════════════════════════════════════════════════
   * F1. 한 층의 상태 전이 — 01 §5.4  (#viz-message-passing)
   *
   *   ① H⁽ˡ⁾(지금 상태) → ② 내부 정점 · ③ 잎 정점 두 장 → ④ H⁽ˡ⁺¹⁾(다음 층 입력)
   *
   * 같은 산술을 네 정점에 네 번 반복하지 않는다. 난도가 달라지는 두 장만 둔다.
   * 집계는 층 안의 한 하위 단계이지 그 자체로 한 층이 아니다.
   * ════════════════════════════════════════════════════════ */

  var SL = '⁽ˡ⁾';
  var SL1 = '⁽ˡ⁺¹⁾';

  function figStateTransition() {
    var g = G.G4, o = gr.ops(g);
    var h = g.nodes.map(function (id) { return g.x[id]; });     // h⁽ˡ⁾
    var m = flat(la.matmul(o.At, colMat(h)));                   // m⁽ˡ⁾ = (A+I)h⁽ˡ⁾
    var nb = {};
    g.nodes.forEach(function (id) { nb[id] = gr.neighbors(g, id); });

    // 두 예시를 손으로 고르지 않는다. 차수 최대(내부)와 차수 1(잎)을 등록부에서 뽑는다.
    var inner = g.nodes.slice().sort(function (a, b) {
      return o.d[o.idx[b]] - o.d[o.idx[a]] || a - b;
    })[0];
    var leaf = g.nodes.filter(function (id) { return o.d[o.idx[id]] === 1; }).pop();
    var collide = Math.abs(m[o.idx[inner]] - m[o.idx[leaf]]) < 1e-12;

    /** 초점 정점으로 들어오는 화살만 라벨을 달고, 나머지는 흐리게 남긴다. */
    function arrowsFor(focus) {
      var out = [];
      g.nodes.forEach(function (i) {
        nb[i].forEach(function (j) {
          out.push({
            from: j, to: i, offset: 5,
            dim: i !== focus,
            label: i === focus ? ('1·' + h[o.idx[j]]) : null
          });
        });
      });
      return out;
    }

    /* ── ② ③ 국소 예시 ─────────────────────────────────── */

    function localFrame(id) {
      var i = o.idx[id];
      var senders = [id].concat(nb[id]);          // 자기 자신이 첫 송신자다
      var isLeaf = (id === leaf);
      var ord = isLeaf ? '③' : '②';
      var kind = isLeaf ? '잎 정점' : '내부 정점';

      return {
        local: id,
        vb: [0, 0, 260, 268],
        title: ord + ' ' + kind + ' v' + id + '의 국소 규칙',
        desc: kind + ' v' + id + '의 상태 전이다. 입력 상태 h' + SL + '는 ' + h[i] +
              '이고 지워지지 않는다. 자기 자신을 포함한 송신자 ' +
              senders.map(function (j) { return 'v' + j; }).join(', ') +
              '의 메시지를 계수 1로 가중해 모으면 중간량 m' + SL + ' = ' + fs(m[i], 2) +
              ' 이고, 층당 하나뿐인 공유 변환 W' + SL + '와 비선형 σ를 지나면 새 상태 h' + SL1 +
              ' = ' + fs(m[i], 2) + ' 가 된다. 송신자는 ' + senders.length + '개다.',
        caption: ord + ' v' + sub(id) + ' (' + kind + ', 송신자 ' + senders.length + '개) — ' +
                 'h' + sub(id) + SL + ' = ' + h[i] + ' → m' + sub(id) + SL + ' = ' + fs(m[i], 2) +
                 ' → h' + sub(id) + SL1 + ' = ' + fs(m[i], 2) + '. ' +
                 (isLeaf
                   ? '이웃이 하나뿐이어도 규칙은 그대로다. 달라지는 것은 주머니 길이뿐이다. ' +
                     (collide
                       ? '두 예시의 새 상태가 둘 다 ' + fs(m[i], 2) +
                         '인 것이 §6 집계 충돌의 출발점이다.'
                       : '')
                   : '이웃이 둘이라 주머니가 한 칸 길다. 나머지 두 정점은 이 둘의 ' +
                     '산술을 되풀이할 뿐이라 그리지 않는다.'),
        draw: function (root, api) {
          heading(root, api,
            ord + ' ' + kind + ' v' + sub(id) + ' · 메시지 ' + senders.length + '개', 10, 14);

          // 테 라벨은 테 위쪽에, 초점 정점의 기호는 원반 위쪽에 붙는다.
          // 두 글자가 같은 띠에서 만나므로 그래프를 제목 아래로 충분히 내린다.
          var gg = placed(root, api, 8, 20);
          var roles = {}, vals = {}, marks = {};
          g.nodes.forEach(function (k, t) {
            roles[k] = (k === id) ? 'focus' : 'active';
            vals[k] = String(h[t]);
          });
          marks[id] = 'h' + SL;
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow,
            roles: roles, values: vals, marks: marks,
            arrows: arrowsFor(id),
            rings: [{
              members: senders, pad: 6,
              label: 'N(v' + sub(id) + ')∪{v' + sub(id) + '}'
            }]
          });

          // 가중 메시지 주머니 → 집계 m → 공유 변환 → 새 상태. 왼→오가 층 방향이다.
          var box = api.drawGrid(root, {
            x: 36, y: 182, cw: 27, ch: 18,
            text: senders.map(function (j) { return ['1', String(h[o.idx[j]])]; }),
            rowLabels: senders.map(vlab),
            rowRoles: senders.map(function (j) { return j === id ? 'focus' : null; }),
            colLabels: ['w', 'h' + SL],
            heading: '메시지'
          });
          var cy = box.y + box.h / 2;

          api.S('line', {
            'class': 'gnn-flow__line',
            x1: box.x + box.w + 6, y1: cy, x2: 112, y2: cy, 'marker-end': api.arrow
          }, root);
          api.S('text', {
            'class': 'gnn-flow__t', x: 104, y: cy - 6, 'text-anchor': 'middle', text: 'Σ'
          }, root);

          api.drawGrid(root, {
            x: 116, y: cy - 11, cw: 42, ch: 22,
            text: [[fs(m[i], 2)]], heading: 'm' + sub(id) + SL
          });
          api.S('line', {
            'class': 'gnn-flow__line', x1: 162, y1: cy, x2: 174, y2: cy, 'marker-end': api.arrow
          }, root);
          api.drawBlock(root, {
            x: 176, y: cy - 15, w: 36, h: 30, label: 'W' + SL, sub: 'σ', muted: true
          });
          api.S('line', {
            'class': 'gnn-flow__line', x1: 214, y1: cy, x2: 219, y2: cy, 'marker-end': api.arrow
          }, root);
          // 격자 제목 h⁽ˡ⁺¹⁾ 가 칸보다 넓어 x = 224 에서는 프레임 오른쪽으로 2.3 삐져나간다.
          // 칸은 그대로 두고 상자만 3 왼쪽으로 민다 — 화살 끝도 같이 3 당긴다.
          api.drawGrid(root, {
            x: 221, y: cy - 11, cw: 34, ch: 22,
            text: [[fs(m[i], 2)]], heading: 'h' + sub(id) + SL1
          });

          note(root, api, '자기 상태도 주머니에 함께 들어간다', 12, 250);
          note(root, api, 'w = 1 · W = I · σ = 항등 — 비학습 장난감', 12, 262);
        }
      };
    }

    var frames = [];

    /* ── ① 입력 상태 ────────────────────────────────────── */

    frames.push({
      span: 'full',
      vb: [0, 0, 424, 186],
      title: '① H' + SL + ' — 층 l의 입력 상태',
      desc: '층 l의 입력 상태 H' + SL + '다. 원반 안 숫자와 격자의 한 열이 같은 값이고 ' +
            g.nodes.map(function (id, i) { return 'v' + id + '는 ' + h[i]; }).join(', ') +
            ' 다. 자기 자신을 포함한 송신자 수는 (' + o.dt.join(', ') + ') 이므로 ' +
            '내부 정점 v' + inner + '과 잎 정점 v' + leaf +
            '이 서로 다른 난도의 두 예시가 된다. ' +
            '이 상태는 메시지를 만드는 동안 지워지지 않는다.',
      caption: '① 입력 상태 H' + SL + ' — 행 = 정점. 이 값은 메시지를 만드는 동안 지워지지 않고, ' +
               '자기 자신도 송신자의 하나로 들어간다. 송신자 수가 다른 두 정점(v' + sub(inner) +
               ', v' + sub(leaf) + ')이 아래 두 예시다.',
      draw: function (root, api) {
        heading(root, api, '① H' + SL + ' — 층 l의 입력 상태', 12, 16);
        var gg = placed(root, api, 0, 26);
        var vals = {}, names = {}, roles = {};
        g.nodes.forEach(function (id, i) {
          vals[id] = String(h[i]);
          // 이 그림은 Â가 정의되기 전에 선다. 아직 뜻이 없는 d̃ 대신
          // 그림 안에서 셀 수 있는 양(자기 포함 송신자 수)으로 적는다.
          names[id] = 'v' + id;
          roles[id] = (id === inner || id === leaf) ? 'focus' : 'active';
        });
        api.drawGraph(gg, {
          graph: g, arrow: api.arrow, roles: roles, values: vals, names: names
        });
        api.drawGrid(root, {
          x: 300, y: 54, cw: 56, ch: 24,
          nums: colMat(h), text: colMat(h).map(function (r) { return [String(r[0])]; }),
          rowLabels: rowLabelsOf(g), heading: 'H' + SL
        });
        note(root, api, '아래 두 예시 — 자기 포함 송신자 수', 240, 166);
        note(root, api, '내부 v' + sub(inner) + ': ' + o.dt[g.nodes.indexOf(inner)] +
          ' · 잎 v' + sub(leaf) + ': ' + o.dt[g.nodes.indexOf(leaf)], 240, 178);
      }
    });

    frames.push(localFrame(inner));
    frames.push(localFrame(leaf));

    /* ── ④ 조립과 다음 층 인계 ──────────────────────────── */

    frames.push({
      handoff: true,
      span: 'full',
      vb: [0, 0, 424, 210],
      title: '④ H' + SL1 + ' — 조립된 새 상태가 다음 층의 입력이 된다',
      desc: '네 행을 모으면 H' + SL1 + ' = (' + m.map(function (v) { return fs(v, 2); }).join(', ') +
            ') 이다. 어느 행도 다른 행의 결과를 기다리지 않으므로 네 행은 같은 국소 규칙을 ' +
            '병렬로 적용한 것이다. 이 격자는 같은 그래프 위에 다시 얹혀 다음 층의 입력 H' + SL +
            ' 자리에 그대로 들어가고, 층 l+1은 같은 규칙을 한 번 더 적용한다. ' +
            '정점이 늘어도 늘어나는 것은 행과 간선 메시지이지 단계 수가 아니다.',
      caption: '④ 조립 — 네 행이 곧 H' + SL1 + '이고, 이 격자가 다음 층의 H' + SL +
               ' 자리에 다시 들어간다. 되먹임 화살이 그 재입력이다. 층을 쌓을수록 ' +
               '수용 범위가 넓어지는 것은 이 고리 때문이다.',
      draw: function (root, api) {
        heading(root, api, '④ H' + SL1 + ' — 조립 후 다음 층으로', 12, 16);

        var b = api.drawGrid(root, {
          x: 52, y: 48, cw: 56, ch: 24,
          nums: colMat(m), text: colMat(m).map(function (r) { return [fs(r[0], 2)]; }),
          rowLabels: rowLabelsOf(g), heading: 'H' + SL1
        });

        api.S('line', {
          'class': 'gnn-flow__line',
          x1: b.x + b.w + 8, y1: 96, x2: 166, y2: 96, 'marker-end': api.arrow
        }, root);
        api.S('text', {
          'class': 'gnn-flow__t', x: 142, y: 88, 'text-anchor': 'middle', text: '재입력'
        }, root);

        var gg = placed(root, api, 166, 34);
        var vals = {}, roles = {};
        g.nodes.forEach(function (id, i) {
          vals[id] = fs(m[i], 2);
          roles[id] = 'active';
        });
        api.drawGraph(gg, { graph: g, arrow: api.arrow, roles: roles, values: vals });

        // 고리: 새 상태가 같은 그래프 위에 다시 얹혀 ①의 자리로 돌아간다.
        api.S('path', {
          'class': 'gnn-flow__line', fill: 'none',
          d: 'M 292 176 L 408 176 L 408 198 L 14 198 L 14 60 L 44 60',
          'marker-end': api.arrow
        }, root);
        api.S('text', {
          'class': 'gnn-flow__t', x: 214, y: 193, 'text-anchor': 'middle',
          text: '층 l+1 — 같은 규칙을 H' + SL1 + '에 다시 적용한다'
        }, root);

        note(root, api, '네 행 모두 같은 규칙 · 병렬', 30, 166);
        note(root, api, 'N이 커지면 행과 메시지만 는다', 30, 180);
      }
    });

    return {
      id: 'state-transition',
      title: '한 층은 상태 전이다 — H' + SL + ' → m' + SL + ' → H' + SL1,
      badge: '스칼라판 h' + SL + ' = (1, 2, 3, 4) · w = 1인 비학습 장난감 집계',
      caption: '무엇을 계산하는가 — 정점마다 자기 상태와 이웃 메시지를 계수로 가중해 모은 ' +
               '중간량 mᵢ' + SL + '를 만들고, 층당 하나뿐인 공유 변환 W' + SL + '와 비선형 σ를 ' +
               '통과시켜 새 상태 hᵢ' + SL1 + '를 얻는다. 무엇이 되는가 — 네 행을 모은 H' + SL1 +
               '이 그대로 다음 층의 입력 H' + SL + ' 자리에 들어간다. 왜 중요한가 — 그 재입력이 ' +
               '반복될 때마다 수용 범위가 넓어지고 표현이 과제에 쓸모 있어진다. ' +
               '집계는 층 안의 한 하위 단계이지 그 자체로 한 층이 아니다. ' +
               '국소 예시를 내부 v' + sub(inner) + '과 잎 v' + sub(leaf) + ' 두 장만 둔 것은, ' +
               '나머지 두 정점이 같은 산술의 반복이어서 난도를 올리지 않기 때문이다.',
      falsify: '메시지 패싱이 정말 순회라면 ④의 H' + SL1 + '에 아직 채워지지 않은 행이 ' +
               '있어야 하고, 시작 정점 하나가 지목되어야 한다. 네 행이 한꺼번에 있고 ' +
               '시작 정점은 없다.',
      cols: 2,
      contract: {
        page: '01_gnn_gentle_guide.md', slot: 'state-transition',
        anchor: 'viz-message-passing',
        data: { graphs: ['G4'], ops: ['At', 'd', 'dt', 'idx'] },
        frames: {
          count: 4, preset: 'wide',
          span: ['full', 'auto', 'auto', 'full'],
          safeArea: SAFE
        },
        primitives: ['S', 'drawBlock', 'drawGraph', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['(1, 2, 3, 4)', '(3, 3, 2, 2)', 'm₁⁽ˡ⁾ = 6', 'm₄⁽ˡ⁾ = 6', '(6, 7, 4, 6)'],
          mustMention: ['비학습 장난감', '병렬', '되먹임 화살'],
          mustNotMention: ['소형 다중']
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ══════════════════════════════════════════════════════════
   * F1b. 집계기 충돌 — 01 §6 (#aggregation)
   *
   * 같은 두 이웃 주머니를 합·평균·최댓값에 통과시킨다. 화살이 한 칸으로
   * 모이면 그 집계기는 두 주머니를 구별하지 못한 것이고, 그 뒤의 W·σ는
   * 같은 입력에서 같은 출력을 낼 수밖에 없다.
   * ════════════════════════════════════════════════════════ */

  function figAggregate() {
    var sum = function (s) {
      return s.reduce(function (a, b) { return a + b; }, 0);
    };
    var RHO = [
      { label: 'ρ = 합', f: sum },
      { label: 'ρ = 평균', f: function (s) { return sum(s) / s.length; } },
      { label: 'ρ = 최댓값', f: function (s) { return Math.max.apply(null, s); } }
    ];

    // 정전 그래프에서 실제로 충돌하는 정점 쌍을 찾아 붙인다. 번호를 적지 않는다.
    var g = G.G4, o = gr.ops(g);
    var gm = flat(la.matmul(o.At, colMat(g.nodes.map(function (id) { return g.x[id]; }))));
    var pair = null;
    g.nodes.forEach(function (a, i) {
      g.nodes.forEach(function (b, j) {
        if (j > i && !pair && Math.abs(gm[i] - gm[j]) < 1e-12) pair = [a, b, gm[i]];
      });
    });

    var CASES = [
      {
        ord: '①', A: [1, 1, 1], B: [1],
        lead: '개수만 다른 두 주머니',
        why: '평균과 최댓값은 "몇 개였는가"를 지운다. 이웃 수가 신호일 때 합을 쓰는 이유다.',
        tail: '이웃이 셋인 정점과 하나뿐인 정점이 평균·최댓값에서는 같은 정점이 된다.',
        short: '이웃 3개와 1개가 같은 정점이 된다'
      },
      {
        ord: '②', A: [1, 3], B: [2, 2],
        lead: '총량은 같고 분포만 다른 두 주머니',
        why: '합과 평균은 "어떻게 나뉘었는가"를 지운다. 두드러진 하나가 중요하면 최댓값이 남긴다.',
        tail: pair
          ? 'G4에서도 자기 연결을 포함한 합에서 v' + sub(pair[0]) + '과 v' + sub(pair[1]) +
            '이 ' + fs(pair[2], 2) + '으로 충돌한다 — §5.4 ④의 두 행이 그것이다.'
          : 'G4에서는 합이 네 행을 모두 갈라 놓는다.',
        short: pair
          ? 'G4의 v' + sub(pair[0]) + '·v' + sub(pair[1]) + '도 합에서 충돌 (§5.4 ④)'
          : 'G4에서는 합이 네 행을 가른다'
      }
    ];

    function caseFrame(c) {
      var verdicts = RHO.map(function (rho) {
        var a = rho.f(c.A), b = rho.f(c.B);
        return { rho: rho, a: a, b: b, collide: Math.abs(a - b) < 1e-12 };
      });

      return {
        span: 'full',
        vb: [0, 0, 424, 288],
        title: c.ord + ' ' + c.lead,
        desc: '두 이웃 주머니 A = {' + c.A.join(', ') + '}, B = {' + c.B.join(', ') +
              '}를 세 집계기에 통과시킨다. ' +
              verdicts.map(function (v) {
                return v.rho.label + '은 ' + fs(v.a, 2) + '와 ' + fs(v.b, 2) + '로 ' +
                       (v.collide ? '충돌한다' : '분리한다');
              }).join(', ') + '. ' + c.why +
              ' 충돌한 자리에서는 두 주머니가 같은 mᵢ' + SL + '를 만들고, 그 뒤의 W' + SL +
              '와 σ는 같은 hᵢ' + SL1 + '만 낼 수 있다 — 어떤 변환도 되살리지 못한다.',
        caption: c.ord + ' ' + c.lead + ' — ' +
                 verdicts.filter(function (v) { return v.collide; })
                   .map(function (v) { return v.rho.label.slice(4); }).join('·') +
                 '에서 두 화살이 한 칸으로 모인다(충돌). ' + c.why + ' ' + c.tail,
        draw: function (root, api) {
          heading(root, api, c.ord + ' A = {' + c.A.join(',') + '} vs B = {' +
            c.B.join(',') + '}', 12, 16);

          verdicts.forEach(function (v, b) {
            var yTop = 38 + b * 72;
            var byTop = yTop + 14 * c.A.length + 8;
            var cA = yTop + 7 * c.A.length;
            var cB = byTop + 7 * c.B.length;

            api.S('text', {
              'class': 'gnn-flow__t', x: 30, y: yTop + 34, text: v.rho.label
            }, root);

            [{ set: c.A, y: yTop, cy: cA, name: 'A' },
             { set: c.B, y: byTop, cy: cB, name: 'B' }].forEach(function (s) {
              api.drawGrid(root, {
                x: 108, y: s.y, cw: 24, ch: 14,
                text: colMat(s.set).map(function (r) { return [String(r[0])]; })
              });
              api.S('text', {
                'class': 'gnn-grid__axis', x: 104, y: s.cy + 3.2,
                'text-anchor': 'end', text: s.name
              }, root);
            });

            // 충돌이면 두 화살이 같은 칸으로 모인다. 정보 손실이 눈에 보여야 한다.
            var tA = v.collide ? yTop + 32 : cA;
            var tB = v.collide ? yTop + 32 : cB;
            [[cA, tA], [cB, tB]].forEach(function (p) {
              api.S('line', {
                'class': 'gnn-flow__line',
                x1: 138, y1: p[0], x2: 216, y2: p[1], 'marker-end': api.arrow
              }, root);
            });

            if (v.collide) {
              api.drawGrid(root, {
                x: 220, y: yTop + 23, cw: 36, ch: 18,
                text: [[fs(v.a, 2)]], rowRoles: ['focus']
              });
            } else {
              api.drawGrid(root, {
                x: 220, y: cA - 9, cw: 36, ch: 18, text: [[fs(v.a, 2)]]
              });
              api.drawGrid(root, {
                x: 220, y: cB - 9, cw: 36, ch: 18, text: [[fs(v.b, 2)]]
              });
            }

            note(root, api,
              (v.collide ? '충돌 — ρ(A) = ρ(B)' : '분리 — ρ(A) ≠ ρ(B)'), 272, yTop + 30);
            note(root, api,
              (v.collide ? '⇒ 같은 m, 같은 h' + SL1 : '⇒ 다른 m, 다른 h' + SL1),
              272, yTop + 44);
          });

          note(root, api, '충돌한 뒤에는 어떤 W·σ도 되살리지 못한다', 12, 264);
          note(root, api, c.short, 12, 278);
        }
      };
    }

    var frames = CASES.map(caseFrame);

    return {
      id: 'aggregate-collide',
      title: '집계는 무엇을 버릴지 고르는 일이다 — 충돌과 분리',
      badge: '이웃 다중집합 두 벌 · ρ = 합 / 평균 / 최댓값',
      caption: '표는 요약이고, 버려지는 정보는 여기서 보인다. 같은 두 주머니 A, B가 세 띠를 ' +
               '지나며 어떤 띠에서는 한 칸으로 모이고 어떤 띠에서는 두 칸으로 갈린다. ' +
               '모이는 순간 정점 i의 중간량 mᵢ' + SL + '가 같아지고, 같은 중간량을 받은 뒤에는 ' +
               '공유 변환 W' + SL + '도 비선형 σ도 두 이웃을 다시 갈라놓지 못한다 — ' +
               '집계기 선택은 계산 편의가 아니라 무엇을 영구히 버릴지의 설계 결정이다.',
      falsify: '"집계기는 계산 편의일 뿐"이 맞다면 여섯 띠의 결과가 모두 두 칸으로 갈라져야 한다. ' +
               '띠마다 한 칸으로 합쳐지는 자리가 있고, 합·평균·최댓값이 서로 다른 자리에서 합쳐진다.',
      cols: 1,
      contract: {
        page: '01_gnn_gentle_guide.md', slot: 'aggregate-collide', anchor: 'aggregation',
        data: { graphs: ['G4'], ops: ['At'] },
        frames: { count: 2, preset: 'wide', span: ['full', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['A = {1, 1, 1}', 'B = {1}', 'A = {1, 3}', 'B = {2, 2}', '6으로 충돌'],
          mustMention: ['충돌', '분리', '§5.4 ④'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ══════════════════════════════════════════════════════════
   * F2. 계보 스트립 X → AX → (A+I)X → ÂX → ÂXW → σ
   *     01 §8 (#viz-lineage) 한 자리에만 선다. 같은 여섯 프레임을
   *     03에서 다시 그리지 않는다 — 계보는 자라야지 반복되면 안 된다.
   * ════════════════════════════════════════════════════════ */

  var LIN = { gx: 64, gy: 42, cw: 34, ch: 22 };

  function lineageFrame(root, api, cfg) {
    heading(root, api, cfg.heading);
    var box = api.drawGrid(root, {
      x: LIN.gx, y: LIN.gy, cw: LIN.cw, ch: LIN.ch,
      nums: cfg.M, text: textMat(cfg.M, 2),
      rowLabels: cfg.rowLabels,
      colLabels: ['c' + sub(1), 'c' + sub(2)],
      negPattern: api.negPattern,
      scale: cfg.scale
    });
    if (cfg.op) {
      api.drawNodeAxisFlow(root, box, {
        arrow: api.arrow, gap: 38, label: cfg.op, labelAbove: true
      });
    }
    if (cfg.blocks) {
      cfg.blocks.forEach(function (b) { api.drawBlock(root, b); });
      // gap 36 이면 이름표가 프레임 아래로 2 삐져나간다. 3 올려 안에 넣는다.
      api.drawFeatureAxisFlow(root, box, {
        arrow: api.arrow, gap: 33, label: '특성 축 — W'
      });
    }
    if (cfg.extraRow) {
      api.drawGrid(root, {
        x: LIN.gx, y: LIN.gy + 4 * LIN.ch, cw: LIN.cw, ch: LIN.ch,
        text: [cfg.extraRow.cells], rowLabels: [cfg.extraRow.label],
        rowRoles: ['out']
      });
    }
    // 마지막 칸에서만: 출력 격자가 ①의 자리로 돌아가는 고리를 눈으로 보여 준다.
    // 같은 여섯 칸을 한 줄 더 반복하지 않는다. 고리 하나면 된다.
    if (cfg.loop) {
      var lx = box.x - 22;
      api.S('path', {
        'class': 'gnn-flow__line', fill: 'none',
        d: 'M ' + (box.x + box.w / 2) + ' ' + (box.y + box.h + 6) +
           ' L ' + (box.x + box.w / 2) + ' ' + (box.y + box.h + 24) +
           ' L ' + lx + ' ' + (box.y + box.h + 24) +
           ' L ' + lx + ' ' + (box.y + box.ch / 2) +
           ' L ' + (box.x - 6) + ' ' + (box.y + box.ch / 2),
        'marker-end': api.arrow
      }, root);
      api.S('text', {
        'class': 'gnn-flow__t', x: box.x + box.w / 2, y: box.y + box.h + 38,
        'text-anchor': 'middle', text: '다음 층의 ① 자리로'
      }, root);
    }
    // 긴 설명은 SVG 안에 넣지 않는다. 좁은 프레임에서는 넘치고 줄바꿈도 되지 않는다.
    // 프레임 캡션(HTML)이 그 자리를 맡는다.
    return box;
  }

  function figLineage() {
    var g = G.G4, o = gr.ops(g);
    var X = gr.featureX(g);
    var W = [[1, -1], [-1, 1]];
    var WPER = [
      [[1, -1], [-1, 1]],
      [[0, 1], [1, 0]],
      [[2, 0], [0, -1]],
      [[-1, -1], [1, 1]]
    ];
    var rows = rowLabelsOf(g);
    var AX = la.matmul(o.A, X);
    var AIX = la.matmul(o.At, X);
    var AhX = la.matmul(o.Ahat, X);

    function mixed(shared) {
      if (shared) return la.matmul(AhX, W);
      return AhX.map(function (r, i) {
        return la.matmul([r], WPER[i])[0];
      });
    }

    function frames(state) {
      var shared = state.w !== 'per';
      var Z = mixed(shared);
      var S1 = la.relu(Z);
      var clipped = 0;
      Z.forEach(function (r) {
        r.forEach(function (v) { if (v < -1e-9) clipped++; });
      });

      var blocks = shared
        ? [{ x: 144, y: 56, w: 38, h: 52, label: 'W', sub: '2×2' }]
        : g.nodes.map(function (id, i) {
            return {
              x: 144, y: LIN.gy + i * LIN.ch + 3, w: 38, h: 16,
              label: 'W' + sub(id)
            };
          });

      var paramNote = shared
        ? '파라미터 C·F = 4개. 정점 수 N과 무관하다.'
        : '파라미터 N·C·F = 16개. 정점이 늘면 함께 늘어난다.';

      var VB = [0, 0, 204, 178];
      var list = [
        {
          vb: VB, title: '① X = H' + SL + ' — 층 l의 입력 상태',
          desc: '정점 4개, 채널 2개의 격자다. 행이 정점, 열이 특성이고 이것이 층 l의 입력 상태 ' +
                'H' + SL + '다. 연산자는 아직 없다.',
          caption: '① X = H' + SL + ' — 행 = 정점, 열 = 특성. 층 l의 입력 상태이고 ' +
                   '연산자는 아직 없다.',
          draw: function (root, api) {
            lineageFrame(root, api, {
              heading: '① X = H' + SL, M: X, rowLabels: rows
            });
          }
        },
        {
          vb: VB, title: '② AX — 이웃 합',
          desc: 'A를 왼쪽에서 곱하면 각 행이 이웃 행들의 합으로 바뀐다. 자기 행은 빠진다.',
          caption: '② AX — 이웃만 더한다. 자기 자신이 빠져 있고, v₃ 행은 v₁ 행 하나만 받는다.',
          draw: function (root, api) {
            lineageFrame(root, api, {
              heading: '② AX', M: AX, rowLabels: rows, op: 'A'
            });
          }
        },
        {
          vb: VB, title: '③ (A+I)X — 자기 연결',
          desc: '대각에 1을 넣으면 자기 행이 합에 다시 들어온다. 값이 커지고 차수 보정은 아직 없다.',
          caption: '③ (A+I)X — 자기 연결이 자기 행을 되돌린다. 값이 커지지만 차수 보정은 아직 없다.',
          draw: function (root, api) {
            lineageFrame(root, api, {
              heading: '③ (A+I)X', M: AIX, rowLabels: rows, op: 'A+I'
            });
          }
        },
        {
          vb: VB, title: '④ ÂX — 대칭 정규화',
          desc: 'Â는 간선마다 1/√(d̃ᵢ d̃ⱼ) 계수를 준다. 행 합은 1이 아니다.',
          caption: '④ ÂX — 계수가 붙었을 뿐, 섞는 축은 여전히 세로다. 여기까지 학습되는 것은 하나도 없다.',
          draw: function (root, api) {
            lineageFrame(root, api, {
              heading: '④ ÂX', M: AhX, rowLabels: rows, op: 'Â'
            });
          }
        },
        {
          vb: VB, title: '⑤ ÂXW — 특성 축 변환',
          desc: 'W는 격자 오른쪽에서 열을 섞는다. ' + paramNote,
          caption: '⑤ ÂXW — ' + (shared
            ? 'W 기둥은 화면에 딱 하나, 네 행이 모두 그것을 통과한다. ' + paramNote
            : '기둥이 네 개로 쪼개졌다. 행마다 다른 규칙이다. ' + paramNote +
              ' 새 정점 v₅에는 쓸 W가 없어 회색 행으로 남는다.'),
          draw: function (root, api) {
            lineageFrame(root, api, {
              heading: '⑤ ÂXW', M: Z, rowLabels: rows,
              blocks: blocks,
              extraRow: shared ? null : {
                label: 'v' + sub(5), cells: ['?', '?']
              }
            });
          }
        },
        {
          vb: VB, title: '⑥ σ(ÂXW) = H' + SL1 + ' — 비선형과 다음 층 인계',
          desc: 'ReLU가 음수 칸 ' + clipped + '개를 0으로 자른다. ' +
                '이 비선형 때문에 두 층은 Â²XW로 접히지 않는다. ' +
                '이 격자가 층 l의 출력 H' + SL1 + '이고, 되먹임 화살이 가리키듯 ' +
                '그대로 다음 층의 ① 자리, 즉 H' + SL + ' 자리에 들어간다.',
          caption: '⑥ σ(ÂXW) = H' + SL1 + ' — 음수 ' + clipped +
                   '칸이 0으로 잘린다. 층이 접히지 않는 이유이고, ' +
                   '되먹임 화살대로 다음 층은 이 격자를 ① 자리(H' + SL + ')에 다시 넣는다. ' +
                   '②–⑤는 층 하나 안의 하위 단계이지 각각이 한 층이 아니다.',
          draw: function (root, api) {
            lineageFrame(root, api, {
              heading: '⑥ σ(ÂXW) = H' + SL1, M: S1, rowLabels: rows, scale: 1,
              loop: true
            });
          }
        }
      ];
      return list;
    }

    return {
      id: 'lineage-strip',
      title: '한 층 안의 여섯 칸 — H' + SL + '에서 H' + SL1 + '까지',
      badge: '2채널판 X = H' + SL + ', W = [[1, −1], [−1, 1]]',
      caption: '바로 위 손계산의 연산 순서를 이어받되, W의 특성 축 변환을 보이기 위해 X를 2채널로 바꾸어 Â, W, σ까지 간다. ' +
        '02 §6과 04 문제 4의 숫자가 여기 ④–⑤ 프레임에 그대로 있다. ' +
        '첫 열 W = [1, −1]ᵀ가 04 문제 4의 W다.' +
        ' 여섯 칸은 층 여섯 개가 아니라 층 하나 안의 하위 단계다 — 집계(②–④)는 ' +
        '그중 한 단계이고, ①이 H' + SL + ', ⑥이 H' + SL1 + '이며 마지막 칸의 ' +
        '되먹임 화살이 그 출력을 다음 층의 ① 자리로 돌려보낸다.',
      falsify: 'Â와 W가 같은 축을 섞는다면 ④와 ⑤에서 격자의 같은 방향이 ' +
               '두 번 눌려야 한다. 한 번은 세로, 한 번은 가로다.',
      cols: 2,
      contract: {
        page: '01_gnn_gentle_guide.md', slot: 'lineage-strip', anchor: 'viz-lineage',
        data: { graphs: ['G4'], ops: ['A', 'At', 'Ahat'] },
        frames: {
          count: 6, countByState: { shared: 6, per: 6 }, preset: 'strip',
          span: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
          safeArea: SAFE
        },
        primitives: ['S', 'drawBlock', 'drawFeatureAxisFlow', 'drawGrid', 'drawNodeAxisFlow'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['[[1,0],[0,1],[1,1],[2,1]]', '[[1,' + MINUS + '1],[' + MINUS + '1,1]]',
            '(0.000, 0.408, 0.408, 0.092)', '4개에서 16개로'],
          mustMention: ['하위 단계', '되먹임 화살', '특성 축'],
          mustNotMention: []
        }
      },
      variant: {
        name: 'w', legend: 'W 공유 여부', initial: 'shared',
        options: [
          { value: 'shared', label: '공유 W (논문)' },
          { value: 'per', label: '정점마다 Wᵢ (틀린 상태)' }
        ],
        wrong: '오른쪽을 고르면 파라미터가 4개에서 16개로 늘고, 새 정점에 쓸 W가 사라진다.'
      },
      frames: frames
    };
  }

  /* ══════════════════════════════════════════════════════════
   * F3. raw / mean / sym 3지 — 02 §5 (#viz-normalization)
   * ════════════════════════════════════════════════════════ */

  function figNorm() {
    var g = G.G4star, o = gr.ops(g);
    var ids = idsOf(g);
    var x = ids.map(function (id) { return g.x[id]; });

    function panel(cfg) {
      return {
        span: 'full',
        vb: [0, 0, 424, 180],
        title: cfg.title,
        desc: cfg.desc,
        caption: cfg.caption,
        draw: function (root, api) {
          var M = cfg.M;
          var out = flat(la.matmul(M, colMat(x)));
          var rs = la.rowSums(M);
          heading(root, api, cfg.heading, 8, 13);
          var gg = placed(root, api, 6, 16);
          var vals = {}, names = {};
          ids.forEach(function (id, i) {
            vals[id] = fx(out[i], 2);
            names[id] = 'v' + id + ' d̃' + o.dt[i];
          });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow,
            roles: cfg.roles(out),
            values: vals, names: names,
            edgeLabel: cfg.edgeLabel ? function (a, b) {
              return cfg.edgeLabel(o.idx[a], o.idx[b]);
            } : null,
            // 굵기는 대칭인 연산자에만 쓴다. D̃⁻¹Ã는 방향마다 계수가 달라
            // 무방향 현 하나의 굵기로 정직하게 표현할 수 없다.
            edgeWidth: cfg.symmetric
              ? function (a, b) { return M[o.idx[a]][o.idx[b]]; }
              : null,
            edgeState: function () { return 'w'; }
          });
          api.drawGrid(root, {
            x: 300, y: 34, cw: 54, ch: 22,
            text: ids.map(function (id, i) { return [fx(rs[i], 2), fx(out[i], 2)]; }),
            rowLabels: rowLabelsOf(g),
            colLabels: ['행 합', '출력']
          });
        }
      };
    }

    // 역할색의 뜻은 사이트 전체에서 고정이다 — focus = 지금 읽는 대상,
    // active = 이번 계산에 참여, idle = 참여하지 않음. 세 프레임 모두 여섯
    // 정점이 전부 갱신되므로 idle인 정점은 없다. 격차를 만드는 최댓값만
    // focus로 두고, 최소·최대의 실제 값은 오른쪽 출력 격자가 숫자로 준다.
    function rolesByMax(out) {
      var mx = Math.max.apply(null, out), r = {};
      ids.forEach(function (id, i) {
        r[id] = Math.abs(out[i] - mx) < 1e-9 ? 'focus' : 'active';
      });
      return r;
    }

    var xOut = {
      raw: flat(la.matmul(o.At, colMat(x))),
      mean: flat(la.matmul(o.Amean, colMat(x))),
      sym: flat(la.matmul(o.Ahat, colMat(x)))
    };
    function ratio(v) {
      return (Math.max.apply(null, v) / Math.min.apply(null, v)).toFixed(2);
    }

    var frames = [
      panel({
        title: '원본 Ã = A + I', heading: '① raw — Ã = A + I',
        M: o.At, symmetric: true,
        edgeLabel: function () { return '1'; },
        roles: rolesByMax,
        desc: '모든 간선 계수가 1이다. 행 합은 차수 d̃와 같고 출력 격차는 ' +
              ratio(xOut.raw) + '배다.',
        caption: '① raw — 계수는 모두 1. 행 합 = d̃ᵢ. ' +
                 '출력 격차 ' + ratio(xOut.raw) + '배.'
      }),
      panel({
        title: '행 평균 D̃⁻¹Ã', heading: '② mean — D̃⁻¹Ã',
        M: o.Amean,
        edgeLabel: null,
        roles: rolesByMax,
        desc: '받는 쪽 차수로만 나눈다. 행 합이 정확히 1.00이고 출력 격차는 ' +
              ratio(xOut.mean) + '배다. 같은 간선이 방향에 따라 다른 계수를 가지므로 비대칭이다.',
        caption: '② mean — 행 합이 정확히 1.00. 출력 격차 ' +
                 ratio(xOut.mean) + '배. 대신 비대칭이고 "이웃 수"라는 신호를 버린다.'
      }),
      panel({
        title: '대칭 정규화 Â', heading: '③ sym — Â = D̃⁻¹ᐟ²ÃD̃⁻¹ᐟ²',
        M: o.Ahat, symmetric: true,
        edgeLabel: function (i, j) { return fx(o.Ahat[i][j], 2); },
        roles: rolesByMax,
        desc: '계수는 1/√(d̃ᵢ d̃ⱼ)다. 행 합이 1이 아니고 출력 격차는 ' +
              ratio(xOut.sym) + '배로 줄되 1배가 되지는 않는다.',
        caption: '③ sym — 행 합이 1이 아니다. 출력 격차 ' +
                 ratio(xOut.sym) + '배. 차수 효과를 줄이되 지우지 않는다.'
      }),
      {
        span: 'full',
        vb: [0, 0, 466, 200],
        title: '행 평균과 대칭 정규화의 계수 격자 비교',
        desc: '왼쪽 D̃⁻¹Ã는 행 합이 모두 1.00이고, 오른쪽 Â는 행 합이 ' +
              fx(Math.min.apply(null, la.rowSums(o.Ahat)), 2) + '에서 ' +
              fx(Math.max.apply(null, la.rowSums(o.Ahat)), 2) + ' 사이로 흩어진다.',
        caption: '같은 자리의 칸과 현이 같은 숫자다. 왼쪽 행 합은 전부 1.00, ' +
                 '오른쪽 행 합은 1.00이 아니다.',
        draw: function (root, api) {
          [
            { M: o.Amean, x: 44, h: 'D̃⁻¹Ã (mean)' },
            { M: o.Ahat, x: 256, h: 'Â (sym)' }
          ].forEach(function (p) {
            api.drawGrid(root, {
              x: p.x, y: 44, cw: 26, ch: 20,
              nums: p.M, text: textMat(p.M, 2),
              rowLabels: p.x === 44 ? rowLabelsOf(g) : null,
              colLabels: ids.map(function (id) { return String(id); }),
              heading: p.h
            });
            api.drawGrid(root, {
              x: p.x + 6 * 26 + 10, y: 44, cw: 34, ch: 20,
              text: la.rowSums(p.M).map(function (v) { return [fx(v, 2)]; }),
              colLabels: ['행 합']
            });
          });
          note(root, api,
            'Â₃₁ = ' + fx(o.Ahat[2][0], 3) +
            ' 와 Â₄₂ = ' + fx(o.Ahat[3][1], 3) +
            ' — 받는 쪽 차수는 둘 다 2인데 계수가 다르다(송신자 차수 5 대 3).',
            14, 190);
        }
      }
    ];

    return {
      id: 'norm-3up',
      title: '정규화는 세 갈래다 — raw / mean / sym',
      badge: 'G4★ (G4 + 잎 v₅, v₆) · x = (1, …, 6)',
      caption: 'G4의 네 정점은 좌표·번호·특성 그대로 있고 잎 두 개만 더했다. ' +
               'd̃ = (5, 3, 2, 2, 2, 2). 특성을 모두 1로 고정하지 않았으므로 ' +
               '받는 쪽 차수뿐 아니라 보내는 쪽 차수 감쇠 1/√d̃ⱼ 도 숫자에 남는다. ' +
               'G4만으로는 d̃ = (3,3,2,2)라 격차가 1.5배뿐이어서 세 갈래의 순위가 벌어지지 않는다.',
      falsify: '"정규화 = 평균"이 맞다면 ②와 ③의 행 합과 출력이 같아야 한다. ' +
               '②의 행 합만 1.00이다.',
      cols: 1,
      contract: {
        page: '02_kipf2017_gcn_guide.md', slot: 'norm-3up', anchor: 'viz-normalization',
        data: { graphs: ['G4star'], ops: ['Ahat', 'Amean', 'At', 'dt'] },
        frames: {
          count: 4, preset: 'wide',
          span: ['full', 'full', 'full', 'full'],
          safeArea: SAFE
        },
        primitives: ['S', 'drawGraph', 'drawGrid'],
        // ④의 주석 한 줄이 67자다 — 두 계수와 두 차수를 한 문장에 담아야 해서
        // 쪼갤 수 없다. 이 그림의 note 천장만 70으로 올린다.
        text: { maxChars: { heading: 34, note: 70, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['0.316', '0.408', '4.25배', '1.75배',
            '(17, 7, 4, 6, 6, 7)', '(1.41, 1.00, 0.82, 0.91, 0.82, 0.82)'],
          mustMention: ['받는 쪽', '보내는 쪽'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ══════════════════════════════════════════════════════════
   * F4. 수용 집합 vs 영향력 — 03 §6 (#receptive-field)
   * ════════════════════════════════════════════════════════ */

  function figDepth() {
    var g = G.G4, o = gr.ops(g);
    var center = 3, ci = o.idx[center];
    var dist = gr.hopDistance(g, center);

    var tri = G.G4tri, to = gr.ops(tri);
    var tdist = gr.hopDistance(tri, center);
    var tRow = la.matpow(to.Ahat, 3)[to.idx[center]];

    function frameK(k) {
      var P = la.matpow(o.Ahat, k);
      var row = P[ci];
      var inside = g.nodes.filter(function (id) { return dist[id] <= k; });
      var vals = {}, roles = {}, marks = {};
      g.nodes.forEach(function (id, i) {
        var on = dist[id] <= k;
        vals[id] = on ? dot3(row[i]) : '—';
        roles[id] = id === center ? 'focus' : (on ? 'active' : 'out');
        marks[id] = on ? (dist[id] + 'h') : '';
      });
      var inRing = inside.map(function (id) { return row[o.idx[id]]; });
      var mn = Math.min.apply(null, inRing), mx = Math.max.apply(null, inRing);

      return {
        vb: [0, 0, 250, 172],
        title: 'k = ' + k + ' 층의 수용 집합과 기여',
        desc: 'v3에서 시작해 ' + k + '층을 쌓았을 때 테 안에 든 정점은 ' +
              inside.map(function (id) { return 'v' + id; }).join(', ') +
              '이고, 각 정점의 기여 (Â^' + k + ')₃ⱼ 는 ' +
              inside.map(function (id) {
                return 'v' + id + ' ' + row[o.idx[id]].toFixed(3);
              }).join(', ') + ' 이다.',
        caption: 'k = ' + k + ' — 테 안 ' + inside.length + '개. 기여 최대 ' +
                 mx.toFixed(3) + ' / 최소 ' + mn.toFixed(3) +
                 (k >= 1 ? ' (' + (mx / mn).toFixed(1) + '배 차)' : ''),
        draw: function (root, api) {
          // 제목을 y = 18 로 내리면 테 이름표와 같은 띠에 든다. 01 §5.4가 쓴 것과
          // 같은 처방 — 그래프를 제목 아래로 12 더 내려 두 글자의 띠를 가른다.
          // k = 0 은 테를 pad 16 으로 벌린다(아래 rings 참고). 그만큼 테 왼끝이
          // 프레임 밖(x = −1)으로 나가므로 이 프레임만 그래프를 8 오른쪽으로 민다.
          var gg = placed(root, api, k === 0 ? 8 : 0, 26);
          // 다른 그림과 같은 y = 18. y = 11 은 글자 윗선이 프레임 위로 0.5 나간다.
          heading(root, api, 'k = ' + k + ' · (Â' +
            (k === 1 ? '' : '^' + k) + ')₃ⱼ', 12, 18);
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow,
            roles: roles, values: vals, marks: marks,
            // k = 0 의 테는 중심 하나만 감싸므로 pad 9 에서는 테 이름표가
            // 그 정점의 걸음표 "0h" 위에 얹힌다. 이 프레임만 테를 7 벌린다.
            rings: [{ members: inside, pad: k === 0 ? 16 : 9, label: 'k ≤ ' + k }],
            edgeState: function (a, b) {
              return (dist[a] <= k && dist[b] <= k) ? 'on' : 'off';
            }
          });
        }
      };
    }

    var frames = [0, 1, 2, 3].map(frameK);

    frames.push({
      span: 'full',
      vb: [0, 0, 446, 240],
      title: 'G4로는 관찰할 수 없는 두 가지 — 이웃 증가와 병목',
      desc: 'G4▲는 G4의 허브 v1, v2에 잎을 둘씩 더한 확장이다. v3에서 3층이면 8개 정점이 ' +
            '테 안에 들어오지만, 허브 두 개를 지난 v7의 기여는 ' + tRow[to.idx[7]].toFixed(3) +
            '로 v3 자신의 ' + tRow[to.idx[3]].toFixed(3) + '에 크게 못 미친다. ' +
            '또 왼쪽 {v3, v5, v6}과 오른쪽 {v4, v7, v8}을 잇는 길은 계수 ' +
            to.Ahat[to.idx[1]][to.idx[2]].toFixed(2) + ' 인 간선 (1,2) 하나뿐이다.',
      caption: 'G4▲ — 정점 4개·지름 3인 G4에서는 이웃 증가도 병목도 정의상 보이지 않는다. ' +
               '그래서 잎 네 개를 더했다. 좌표·번호·특성은 그대로다.',
      draw: function (root, api) {
        // 테는 정점보다 pad만큼 위로 자란다. 58이면 테 라벨이 프레임 위로 잘린다.
        var gg = placed(root, api, -4, 66);
        var inside = tri.nodes.filter(function (id) { return tdist[id] <= 3; });
        var vals = {}, roles = {}, marks = {};
        tri.nodes.forEach(function (id) {
          var i = to.idx[id];
          vals[id] = dot3(tRow[i]);
          roles[id] = id === center ? 'focus' : 'active';
          marks[id] = tdist[id] + 'h';
        });
        api.drawGraph(gg, {
          graph: tri, arrow: api.arrow,
          roles: roles, values: vals, marks: marks,
          rings: [{ members: inside, pad: 8, label: 'k ≤ 3' }],
          edgeState: function (a, b) {
            return (a === 1 && b === 2) || (a === 2 && b === 1) ? 'bottleneck' : 'on';
          },
          edgeLabel: function (a, b) {
            return (a === 1 && b === 2) || (a === 2 && b === 1)
              ? fx(to.Ahat[to.idx[a]][to.idx[b]], 2) : null;
          }
        });
        api.drawGrid(root, {
          x: 332, y: 52, cw: 26, ch: 22,
          text: [
            [0, 1, 2, 3].map(function (k) {
              return String(g.nodes.filter(function (id) { return dist[id] <= k; }).length);
            }),
            [0, 1, 2, 3].map(function (k) {
              return String(tri.nodes.filter(function (id) { return tdist[id] <= k; }).length);
            })
          ],
          rowLabels: ['G4', 'G4▲'],
          colLabels: ['0', '1', '2', '3'],
          heading: '|수용 집합| (k)'
        });
        note(root, api,
          '병목: 왼쪽 {3,5,6} → 오른쪽 {4,7,8}의 통로는 계수 ' +
          fx(to.Ahat[to.idx[1]][to.idx[2]], 2) + '인 간선 (1,2) 하나뿐이다.',
          16, 212);
        note(root, api,
          '3-hop v₇의 기여 ' + tRow[to.idx[7]].toFixed(3) +
          ' 는 v₃ 자신 ' + tRow[to.idx[3]].toFixed(3) + '의 ' +
          Math.round(tRow[to.idx[7]] / tRow[to.idx[3]] * 100) + '%다.',
          16, 228);
      }
    });

    return {
      id: 'depth-frames',
      title: '수용 집합 ≠ 영향력',
      badge: 'G4, 중심 v₃ · 마지막 프레임만 G4▲',
      caption: '테(R)는 이진 집합이고 원반 안 숫자는 연속량 (Âᵏ)₃ⱼ 다. ' +
               '두 인코딩이 한 프레임에 겹쳐 있으므로 "테 안에 있지만 거의 기여하지 않는 정점"을 ' +
               '직접 지목할 수 있다. 화살표 대신 계수를 쓰는 이유는, 영향력이 포함/불포함이 아니라 ' +
               '경로마다 ∏1/√d̃ 로 감쇠하는 양이기 때문이다.',
      falsify: '"k층이면 k-hop 정점이 균등하게 들어온다"가 맞다면 k = 3 프레임의 네 숫자가 ' +
               '같아야 한다. 가장 작은 값이 가장 큰 값의 6분의 1 아래다.',
      cols: 2,
      contract: {
        page: '03_bridge_mlp_to_gcn.md', slot: 'depth-frames', anchor: 'receptive-field',
        data: { graphs: ['G4', 'G4tri'], ops: ['Ahat', 'idx'] },
        frames: {
          count: 5, preset: 'tall',
          span: ['auto', 'auto', 'auto', 'auto', 'full'],
          safeArea: SAFE
        },
        primitives: ['S', 'drawGraph', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['0.347', '0.329', '0.159', '0.056', '0.20', '0.020'],
          mustMention: ['수용 집합', '연속량'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ══════════════════════════════════════════════════════════
   * F5. 반복 전파와 표현 수렴 — 02 §11 (#depth-appendix-b)
   * ════════════════════════════════════════════════════════ */

  function figConverge() {
    var g = G.G4, o = gr.ops(g);
    var x = g.nodes.map(function (id) { return g.x[id]; });
    var KS = [0, 1, 2, 4, 8];

    function hk(k) { return flat(la.matmul(la.matpow(o.Ahat, k), colMat(x))); }

    // Â의 최대 고유벡터는 √d̃ 이고 고유값은 정확히 1이다. 극한은 그 방향이다.
    var sq = o.dt.map(function (v) { return Math.sqrt(v); });
    var dotv = sq.reduce(function (a, v, i) { return a + v * x[i]; }, 0);
    var nrm = sq.reduce(function (a, v) { return a + v * v; }, 0);
    var limit = sq.map(function (v) { return v * dotv / nrm; });

    function spread(k) {
      var h = hk(k);
      var r = h.map(function (v, i) { return v / sq[i]; });
      return Math.max.apply(null, r) - Math.min.apply(null, r);
    }
    var spreads = [0, 1, 2, 4, 8].map(function (k) {
      return { k: k, v: spread(k) };
    });

    return {
      id: 'oversmoothing',
      title: '같은 연산자를 반복하면 표현이 한 방향으로 수렴한다',
      badge: 'G4 · 스칼라판 x = (1, 2, 3, 4)',
      caption: 'Â의 최대 고유값은 정확히 1이고 그 고유벡터는 √d̃ 다. ' +
               '따라서 Âᵏx 는 √d̃ 방향으로 수렴한다 — 층을 충분히 쌓으면 ' +
               '정점을 구별하는 정보로 차수만 남는다. 오버스무딩은 별개의 사고가 아니라 ' +
               '이 거듭제곱의 결과다.',
      falsify: '수렴이 "값이 0으로 죽는 것"이라면 k = 8 격자가 비어야 한다. ' +
               '값은 남고 행 사이 구별만 사라진다.',
      cols: 1,
      contract: {
        page: '02_kipf2017_gcn_guide.md', slot: 'oversmoothing', anchor: 'viz-oversmoothing',
        data: { graphs: ['G4'], ops: ['Ahat', 'dt'] },
        frames: { count: 2, preset: 'wide', span: ['full', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawAxis', 'drawGrid'],
        // ②의 제목이 36자(수식 한 줄)이고 ①의 주석이 70자다. 둘 다 한 덩이라
        // 쪼개면 뜻이 끊긴다 — 이 그림의 천장만 40 / 70으로 올린다.
        text: { maxChars: { heading: 40, note: 70, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          // √3 : √2 의 값은 네 자리 소수라 명세에 적을 수 없다. 비 자체를 말로 건다.
          numbers: ['(2.225, 2.633, 1.908, 2.816)', '(2.615, 2.615, 2.135, 2.135)',
            '2.251', '0.067'],
          mustMention: ['단조 감소', '1차원 축', '√3 : √2'],
          mustNotMention: []
        }
      },
      frames: function () {
        return [
          {
            span: 'full',
            vb: [0, 0, 468, 164],
            title: '층 수에 따른 Â^k x',
            desc: KS.map(function (k) {
              return 'k=' + k + '일 때 ' + hk(k).map(function (v) {
                return v.toFixed(3);
              }).join(', ');
            }).join('; ') + '. 극한은 ' +
              limit.map(function (v) { return v.toFixed(3); }).join(', ') + ' 이다.',
            caption: '왼→오가 층이다. 네 행이 서로 닮아 가고, 마지막에 남는 차이는 ' +
                     'd̃ = (3, 3, 2, 2)뿐이다.',
            draw: function (root, api) {
              KS.forEach(function (k, j) {
                var h = hk(k);
                api.drawGrid(root, {
                  x: 40 + j * 70, y: 48, cw: 44, ch: 24,
                  nums: colMat(h), text: colMat(h).map(function (r) {
                    return [fx(r[0], 3)];
                  }),
                  rowLabels: j === 0 ? rowLabelsOf(g) : null,
                  heading: 'k = ' + k,
                  scale: 4
                });
              });
              api.drawGrid(root, {
                x: 410, y: 48, cw: 48, ch: 24,
                nums: colMat(limit), text: colMat(limit).map(function (r) {
                  return [fx(r[0], 3)];
                }),
                heading: 'k → ∞', scale: 4
              });
              note(root, api,
                '극한 = (√d̃ · x / ‖√d̃‖²) √d̃. ' +
                'v₁/v₂ 대 v₃/v₄ 비는 √3 : √2 = ' +
                (Math.sqrt(3) / Math.sqrt(2)).toFixed(4) + ' 로 고정된다.',
                16, 154);
            }
          },
          {
            span: 'full',
            vb: [0, 0, 468, 126],
            title: '행 간 거리의 붕괴',
            desc: '각 행을 √d̃ᵢ로 나눈 뒤의 최대-최소 차이는 ' +
              spreads.map(function (s) {
                return 'k=' + s.k + '에서 ' + s.v.toFixed(3);
              }).join(', ') + ' 로 단조 감소한다.',
            caption: '정점 축 위에 살지 않는 양이므로 별도 1차원 축에만 그린다. ' +
                     '0에 닿는 것이 표현 수렴이다.',
            draw: function (root, api) {
              heading(root, api, '행 간 최대 거리  maxᵢⱼ |hᵢ/√d̃ᵢ − hⱼ/√d̃ⱼ|', 14, 20);
              api.drawAxis(root, {
                x: 54, y: 52, w: 386, min: 0, max: 2.4,
                rows: [{
                  label: 'k',
                  marks: spreads.map(function (s) {
                    return { v: s.v, label: String(s.k) };
                  })
                }],
                ticks: [0, 0.5, 1, 1.5, 2].map(function (v) {
                  return { v: v, label: v.toFixed(1) };
                }),
                caption: '층이 늘수록 왼쪽(0)으로 간다. k = 8에서 ' +
                         spreads[spreads.length - 1].v.toFixed(3) + '.'
              });
            }
          }
        ];
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
   * F6. 스펙트럼 다리 아홉 장 — 05
   *   spec-eigen(S5) · spec-lambda(S6) · spec-basis(S7) · spec-filter(S8)
   *   spec-hop(S10) · spec-cheby(S11) · spec-explode(S13)
   *   spec-swap(S14) · spec-mu(S15)
   *
   * 모드 축 규약 — 모드마다 하나씩 붙는 양(λₖ, cₖ, g(λₖ), 모드별 거칢)은
   * 정점 축 격자에 넣지 않는다. 축(drawAxis)이나 막대(drawBars)로 그리고
   * 라벨은 u₁..u₄ 다. 고유벡터 자체는 정점 위의 값이므로 원반과 격자에 그린다.
   * ════════════════════════════════════════════════════════ */

  var LBADGE = 'G4 · L = I − D⁻¹ᐟ²AD⁻¹ᐟ²';
  var ORD = ['①', '②', '③', '④', '⑤'];

  function ulab(k) { return 'u' + sub(k + 1); }

  function sumOf(a) {
    return a.reduce(function (s, t) { return s + t; }, 0);
  }

  function vecText(v, d) {
    return '(' + v.map(function (t) { return num(t, d); }).join(', ') + ')';
  }

  /** 간선을 따라 양 끝 부호가 갈리는 간선 수. */
  function flipsOf(g, o, vec) {
    return g.edges.filter(function (e) {
      return vec[o.idx[e[0]]] * vec[o.idx[e[1]]] < 0;
    }).length;
  }

  function signalOf(g) {
    return g.nodes.map(function (id) { return g.x[id]; });
  }

  /**
   * 자기 고리 숫자 상자를 간선 숫자 상자에서 비켜 놓는 가로 옮김.
   * G4의 아래쪽 두 정점에서만 두 상자가 겹친다 — 좌표는 동결이므로 상자를 옮긴다.
   */
  function loopDx(id) {
    return id === 3 ? -13 : 0;
  }

  /**
   * 격자 두 상자를 하나의 테로 묶는다. 테 스타일은 .gnn-ring rect 를 그대로 쓴다.
   * drawGrid 가 돌려주는 상자는 칸만 재고 행 이름표(x0 왼쪽)와 열 이름표(y0 위)는
   * 그 밖에 있으므로, 왼쪽·위로 더 벌려 테가 이름표를 가로지르지 않게 한다.
   */
  function ringAround(root, api, a, b) {
    var x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    var x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
    var padL = 22, padT = 14, padR = 8, padB = 8;
    var ring = api.S('g', { 'class': 'gnn-ring' }, root);
    api.S('rect', {
      x: x0 - padL, y: y0 - padT,
      width: x1 - x0 + padL + padR, height: y1 - y0 + padT + padB, rx: 8
    }, ring);
  }

  /* ── A0. spec-recap — S3 ──────────────────────────────── */
  /*
   * S3에 이르면 독자가 셋을 잃어버린다 — G4의 배선, 03에서 만든 원본 A, S1에서
   * 정점마다 붙인 x. 셋을 다시 찾으러 위로 스크롤하거나 03으로 돌아가는 왕복을
   * 없애는 것이 이 그림의 유일한 임무다. 새 사실은 하나도 만들지 않고, 다음 줄이
   * 출발하는 자리(D − A = Δ)까지만 간다.
   */

  function figSpecRecap() {
    var L = NI3.LAYOUT || {};
    var HALF = (L.frame && L.frame.half && L.frame.half.w) || 330;
    var VB = [0, 0, HALF, 176];

    var g = G.G4, o = gr.ops(g);
    var x = signalOf(g);
    // D = diag(d), Δ = D − A. 둘 다 등록부의 A·d에서 만든다.
    var D = o.A.map(function (r, i) {
      return r.map(function (v, j) { return i === j ? o.d[i] : 0; });
    });
    var Delta = la.msub(D, o.A);

    var labels = rowLabelsOf(g);
    var tX = textMat(colMat(x), 0);
    var tA = textMat(o.A, 0);
    var tD = textMat(D, 0);
    var tDelta = textMat(Delta, 0);

    var edgeText = g.edges.map(function (e) {
      return '(' + e[0] + ', ' + e[1] + ')';
    }).join(', ');
    function rowText(T) {
      return T.map(function (r, i) {
        return labels[i] + ' = (' + r.join(', ') + ')';
      }).join(', ');
    }

    // 화면에 찍히는 숫자 전부. 계약의 fallback.numbers 는 손으로 적지 않는다.
    var shown = [];
    [tX, tA, tD, tDelta].forEach(function (T) {
      T.forEach(function (r) {
        r.forEach(function (s) { if (shown.indexOf(s) < 0) shown.push(s); });
      });
    });

    var frames = [];

    frames.push({
      preset: 'half',
      vb: VB,
      title: '① G4와 신호 x',
      desc: '① G4 — 정점 넷 ' + labels.join(', ') + '와 간선 셋 ' + edgeText +
            '을 원반과 현으로 그리고, 원반 안에 신호 값 ' +
            tX.map(function (r) { return r[0]; }).join(', ') + '을 적는다. 오른쪽에는 x = ' +
            vecText(x, 0) + '를 칸 넷의 세로 한 줄로 세운다 — 정점별 스칼라 신호이고, ' +
            'i번째 행이 원반 v' + sub(1) + '..v' + sub(4) + ' 순서 그대로다.',
      caption: '① 03에서 쓰던 그 배선 그대로다. 오른쪽 칸 한 줄이 신호 x이고, i번째 행의 숫자가 ' +
               '원반 vᵢ 안의 숫자와 같다.',
      draw: function (root, api) {
        heading(root, api, 'G4 — 03에서 이어 쓰는 그 그래프', 14, 18);
        var gg = placed(root, api, 0, 12);
        var vals = {}, roles = {}, names = {};
        g.nodes.forEach(function (id, i) {
          vals[id] = tX[i][0];
          roles[id] = 'active';
          names[id] = labels[i];
        });
        api.drawGraph(gg, {
          graph: g, arrow: api.arrow, roles: roles, values: vals, names: names
        });
        api.drawGrid(root, {
          x: 262, y: 44, cw: 48, ch: 24,
          nums: colMat(x), text: tX,
          rowLabels: labels, colLabels: ['x']
        });
        note(root, api, 'x — 정점별 스칼라 신호 (정점마다 숫자 하나)', 14, 166);
      }
    });

    frames.push({
      preset: 'half',
      vb: VB,
      title: '② 원본 A와 차수 D — Δ = D − A',
      desc: '② 네 줄 네 칸짜리 격자 셋을 D − A = Δ 순으로 늘어놓는다. 원본 인접 행렬 A의 행은 ' +
            '순서대로 ' + rowText(tA) + '이고, 행과 열의 순서가 둘 다 ' + labels.join(', ') +
            '다. D는 차수 d = ' + vecText(o.d, 0) + '을 대각에 놓은 것이고, Δ = D − A의 행은 ' +
            rowText(tDelta) + '이다. 다음 줄의 Δx가 이 Δ에서 출발한다.',
      caption: '② A는 03 §2.1에서 만든 원본이다. 자기 연결을 더하기 전이므로 대각이 전부 0이고, ' +
               '거기에 차수 D를 얹은 것이 Δ = D − A다.',
      draw: function (root, api) {
        heading(root, api, 'D ' + MINUS + ' A = Δ · A는 03 §2.1의 원본 인접 행렬', 14, 18);
        api.drawGrid(root, {
          x: 32, y: 52, cw: 19, ch: 19,
          nums: D, text: tD,
          rowLabels: labels, colLabels: labels, heading: 'D — 차수'
        });
        api.drawGrid(root, {
          x: 132, y: 52, cw: 19, ch: 19,
          nums: o.A, text: tA,
          rowLabels: labels, colLabels: labels, heading: MINUS + ' A (원본)'
        });
        api.drawGrid(root, {
          x: 238, y: 52, cw: 19, ch: 19,
          nums: Delta, text: tDelta,
          rowLabels: labels, colLabels: labels, heading: '= Δ',
          negPattern: api.negPattern
        });
        note(root, api, 'D = diag(d) · d = ' + vecText(o.d, 0), 14, 144);
        note(root, api, 'Δ = D ' + MINUS + ' A — 다음 줄의 Δx가 여기서 출발한다', 14, 160);
      }
    });

    return {
      id: 'spec-recap',
      title: '지금 손에 든 것 — G4 · A · x',
      badge: 'G4 · Δ = D ' + MINUS + ' A',
      caption: '새 사실은 없다. 03의 배선 G4, 03 §2.1의 원본 인접 행렬 A, S1에서 정점마다 붙인 ' +
               '신호 x를 한 화면에 모아 두고, 다음 줄이 출발하는 Δ = D ' + MINUS + ' A까지만 간다.',
      falsify: '이 그림이 03·S1과 같은 것을 가리킨다면 A의 1이 현 ' + edgeText +
               '과 정확히 같은 자리에 있어야 하고, x의 i번째 칸이 원반 vᵢ 안의 숫자와 같아야 한다. ' +
               '세 간선과 네 칸이 모두 일치한다.',
      cols: 2,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-recap', anchor: 's3',
        data: { graphs: ['G4'], ops: ['A', 'd'] },
        frames: {
          count: frames.length, preset: 'half',
          span: frames.map(function () { return 'auto'; }),
          safeArea: L.safeArea || 6
        },
        primitives: ['drawGraph', 'drawGrid', 'S'],
        text: { maxChars: { heading: 34, note: 52, caption: 240 } },
        fallback: {
          declaresFrameCount: true,
          numbers: shown,
          mustMention: ['정점별 스칼라 신호'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ── A1. spec-eigen — S5 ──────────────────────────────── */

  function figSpecEigen() {
    var g = G.G4, o = gr.ops(g);
    var x = signalOf(g);
    var Lx = la.matvec(o.L, x);
    var eig = la.jacobiEig(o.L);
    var frames = [];

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 176],
      title: '① 우리 신호는 고유벡터가 아니다',
      desc: '① 우리 신호 x = ' + vecText(x, 0) + '를 L에 통과시킨 결과 Lx = ' +
            vecText(Lx, 3) + '을 x 옆에 나란히 놓은 것. 두 격자의 행 비율이 서로 달라서 ' +
            'x는 이 조건을 만족하지 않는다 — x는 고유벡터가 아니다.',
      caption: '① 두 열의 행 비율이 다르다. x는 통과해도 모양이 그대로인 신호가 아니다.',
      draw: function (root, api) {
        var gg = placed(root, api, 0, 12);
        var vals = {}, roles = {};
        g.nodes.forEach(function (id) { vals[id] = String(g.x[id]); roles[id] = 'active'; });
        api.drawGraph(gg, { graph: g, arrow: api.arrow, roles: roles, values: vals });
        api.drawGrid(root, {
          x: 300, y: 46, cw: 56, ch: 24,
          nums: x.map(function (v, i) { return [v, Lx[i]]; }),
          text: x.map(function (v, i) { return [num(v, 0), num(Lx[i], 3)]; }),
          rowLabels: rowLabelsOf(g), colLabels: ['x', 'Lx'],
          heading: '신호와 통과한 결과', negPattern: api.negPattern
        });
      }
    });

    eig.values.forEach(function (lam, k) {
      var u = eig.vectors[k];
      var flips = flipsOf(g, o, u);
      var lhs = la.dot(o.L[0], u);
      var rhs = lam * u[0];
      var tail = k === 0
        ? ' — 가장 평평한 신호. 값은 상수가 아니라 √d 에 비례한다.'
        : (flips === g.edges.length
          ? ' — 가장 자주 어긋나는 신호. 세 간선에 모두 ' + MINUS + ' 가 붙는다.'
          : '');
      frames.push({
        vb: [0, 0, 330, 176],
        title: ORD[k + 1] + ' ' + ulab(k) + ', λ = ' + fx(lam, 2),
        desc: ORD[k + 1] + ' ' + ulab(k) + ' = ' + vecText(u, 3) + ', λ = ' + fx(lam, 2) +
              ', 양 끝 부호가 갈리는 간선 ' + flips + '개. 그런 간선 위에는 ' + MINUS +
              ' 를 적는다. 검산 한 줄은 본문이 L의 3행으로 한 검산을 1행으로 되풀이한 것이다 — ' +
              '같은 수치를 두 곳에 인쇄하지 않기 위해서다.',
        // tail 이 빈 프레임(k = 1, 2)에서 두 문장이 붙어 버린다. 마침표를 채워 끊는다.
        caption: ORD[k + 1] + ' λ = ' + fx(lam, 2) + ' · 부호가 갈리는 간선 ' + flips + '개' +
                 (tail || '.') + ' 검산 — L의 1행 · ' + ulab(k) + ' = ' + num(lhs, 3) + ' = λ × ' +
                 ulab(k) + '의 1성분 ' + num(rhs, 3) + '.',
        draw: function (root, api) {
          var gg = placed(root, api, 0, 12);
          var vals = {}, roles = {};
          g.nodes.forEach(function (id, i) { vals[id] = dot3(u[i]); roles[id] = 'active'; });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: roles, values: vals,
            edgeLabel: function (a, b) {
              return u[o.idx[a]] * u[o.idx[b]] < 0 ? MINUS : null;
            }
          });
          api.drawGrid(root, {
            x: 262, y: 44, cw: 48, ch: 24,
            nums: colMat(u),
            text: colMat(u).map(function (r) { return [num(r[0], 3)]; }),
            rowLabels: rowLabelsOf(g), heading: ulab(k), negPattern: api.negPattern
          });
          note(root, api, '부호가 갈리는 간선 = ' + MINUS, 14, 166);
        }
      });
    });

    return {
      id: 'spec-eigen',
      title: '통과해도 모양이 안 변하는 신호는 넷이다',
      badge: LBADGE,
      caption: '우리 신호는 이 조건을 만족하지 않는다. 뒤 네 프레임이 만족하는 넷이고, ' +
               '각 프레임의 검산 한 줄이 그것을 한 행으로 보여 준다.',
      falsify: '이 넷이 정말 모양이 안 변하는 신호라면 각 프레임의 검산 줄 좌변과 우변이 ' +
               '같아야 한다. 네 프레임 모두 같다. ① 프레임에서만 두 열의 비율이 어긋난다.',
      cols: 2,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-eigen', anchor: 's5',
        data: { graphs: ['G4'], ops: ['L', 'idx'] },
        frames: {
          count: 5, preset: 'half',
          span: ['full', 'auto', 'auto', 'auto', 'auto'],
          safeArea: SAFE
        },
        primitives: ['S', 'drawGraph', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: [
            '(' + MINUS + '2.121, ' + MINUS + '1.328, 2.293, 2.586)',
            '(0.577, 0.577, 0.408, 0.408)',
            '(0.408, ' + MINUS + '0.408, 0.577, ' + MINUS + '0.577)',
            '(0.408, 0.408, ' + MINUS + '0.577, ' + MINUS + '0.577)',
            '(0.577, ' + MINUS + '0.577, ' + MINUS + '0.408, 0.408)'
          ],
          mustMention: ['검산 한 줄', '고유벡터가 아니다'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ── A2. spec-lambda — S6 ─────────────────────────────── */

  function figSpecLambda() {
    var g = G.G4, o = gr.ops(g);
    var eig = la.jacobiEig(o.L);

    // 약분판 — 표시용 상수배. 소수점을 없애면 거칢이 정수 0, 3, 9, 12로 떨어진다.
    var rows = eig.values.map(function (lam, k) {
      var s = la.vscale(eig.vectors[k]);
      var v = eig.vectors[k].map(function (t) { return t * s; });
      var rough = la.dot(v, la.matvec(o.L, v));
      var norm = la.dot(v, v);
      return { lam: lam, v: v, rough: rough, norm: norm, quot: rough / norm };
    });
    var sqd = o.d.map(Math.sqrt);
    var flat0 = eig.vectors[0];

    var frames = [];

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 168],
      title: '① 네 방향의 거칢을 재면',
      // 값 목록 뒤에 조사를 고정으로 붙이면 받침에 따라 "12과"가 된다. 괄호로 감싼다.
      desc: '① 위 표의 계산을 네 줄로 그린 것. 줄마다 그 방향 하나를 맡고, 차수로 나눈 판에서 ' +
            '잰 거칢(' + rows.map(function (r) { return num(r.rough, 0); }).join(', ') +
            ')과 약분판에서 잰 크기의 제곱(모두 ' + num(rows[0].norm, 0) + ')과 몫 ' +
            rows.map(function (r) { return num(r.quot, 2); }).join(', ') +
            '을 늘어놓는다. 줄 이름은 ' + rows.map(function (r, k) { return ulab(k); }).join(', ') +
            ' 이고 v₁..v₄ 가 아니다. 마지막 칸이 λ와 같다.',
      caption: '① 몫 열이 λ 와 같다. 네 방향의 크기 제곱이 모두 같으므로 λ 의 순서가 곧 ' +
               '거칢의 순서다. 여기 거칢은 차수로 나눈 판에서 잰 값이다.',
      draw: function (root, api) {
        heading(root, api, '약분판에서 잰 거칢 · 크기의 제곱 · 몫', 14, 20);
        var cx = [126, 246, 350];
        note(root, api, '방향', 34, 44);
        note(root, api, '거칢 vᵀLv', cx[0], 44);
        // u₁..u₄ 자체의 크기 제곱은 1이다. 이 열의 6은 약분판에서 잰 값이므로 열 머리에 밝힌다.
        note(root, api, '크기의 제곱 (약분판)', cx[1], 44);
        note(root, api, '몫', cx[2], 44);
        rows.forEach(function (r, k) {
          var y = 68 + k * 20;
          note(root, api, ulab(k), 34, y);
          note(root, api, num(r.rough, 0), cx[0], y);
          note(root, api, num(r.norm, 0), cx[1], y);
          note(root, api, num(r.quot, 2), cx[2], y);
        });
      }
    });

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 168],
      title: '② 고유값은 별도 축 위에만 산다',
      desc: '② 0에서 2까지의 1차원 축 한 줄에 네 눈금 ' +
            eig.values.map(function (v) { return fx(v, 2); }).join(', ') +
            '을 찍고, 눈금마다 그 방향에서 부호가 바뀌는 간선의 수 ' +
            eig.vectors.map(function (v) { return flipsOf(g, o, v); }).join(', ') +
            '을 붙인 것. 축 아래 한 줄: λ = 0 방향의 값은 ' + vecText(flat0, 3) +
            '이고 √d = ' + vecText(sqd, 3) + '에 비례한다.',
      caption: '② 눈금이 왼쪽에 있을수록 이웃과 덜 어긋난다.',
      draw: function (root, api) {
        heading(root, api, 'λ 축 — 눈금 위 숫자는 부호가 바뀌는 간선의 수', 14, 20);
        api.drawAxis(root, {
          x: 96, y: 62, w: 300, min: -0.15, max: 2.15,
          rows: [{
            label: 'λ',
            marks: eig.values.map(function (lam, k) {
              return { v: lam, label: String(flipsOf(g, o, eig.vectors[k])) };
            })
          }],
          ticks: eig.values.map(function (lam) {
            return { v: lam, label: fx(lam, 2) };
          }),
          caption: 'λ 축'
        });
        note(root, api, 'λ = 0 방향의 값 ' + vecText(flat0, 3), 24, 124);
        note(root, api, '√d = ' + vecText(sqd, 3) + ' 에 비례한다', 24, 142);
      }
    });

    return {
      id: 'spec-lambda',
      title: 'λ는 거칢을 크기의 제곱으로 나눈 값이다',
      badge: LBADGE,
      caption: 'λ 는 어떤 정점의 값도 아니다. 그래서 원반에도 격자에도 넣지 않고 축 위에만 ' +
               '그린다. 이 축이 S13·S15에서 그대로 다시 나온다.',
      falsify: 'λ 가 거칢 눈금이 아니라면 ① 마지막 열과 ② 축의 눈금이 어긋나야 한다. ' +
               '네 줄이 모두 일치한다.',
      cols: 1,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-lambda', anchor: 's6',
        data: { graphs: ['G4'], ops: ['L', 'd', 'idx'] },
        frames: { count: 2, preset: 'wide', span: ['full', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawAxis'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['0, 3, 9, 12', '0, 0.50, 1.50, 2.00',
            '(0.577, 0.577, 0.408, 0.408)', '(1.414, 1.414, 1, 1)'],
          mustMention: ['1차원 축', 'u₁, u₂, u₃, u₄'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ── A3. spec-basis — S7 ──────────────────────────────── */

  function figSpecBasis() {
    var g = G.G4, o = gr.ops(g);
    var x = signalOf(g);
    var eig = la.jacobiEig(o.L);
    // vectors[k] 가 k번째 고유벡터이므로 배열 그대로가 Uᵀ다. c = Uᵀx 한 줄.
    var c = flat(la.matmul(eig.vectors, colMat(x)));
    var f4 = function (v) { return fx(v, 4); };
    var sq2 = c.map(function (t) { return t * t; });
    var lsq = eig.values.map(function (l, k) { return l * sq2[k]; });
    var sumSq = sumOf(sq2), sumLsq = sumOf(lsq);
    var labels = c.map(function (t, k) { return ulab(k); });

    var frames = [];

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 182],
      title: '① 쪼개면 네 숫자가 나온다',
      desc: '① 분해 — 왼쪽에 신호 x의 격자 ' + vecText(x, 0) + ', 오른쪽에 네 모드의 격자 ' +
            '네 열, 그 사이에 계수 c = ' + vecText(c, 3) + '를 0선 기준 막대 네 개로 그린 것. ' +
            '격자의 행 순서는 v1, v2, v3, v4로 고정이고 λ 순으로 재정렬하지 않는다. ' +
            '막대는 정점 축 위의 양이 아니므로 ' + labels.join(', ') + ' 로 이름을 단다.',
      caption: '① 막대는 정점 축 위의 양이 아니므로 ' + labels[0] + '..' + labels[3] +
               ' 로 이름을 단다. 오른쪽 격자의 행은 λ 순으로 재정렬하지 않는다.',
      draw: function (root, api) {
        heading(root, api, 'x 를 네 모드로 쪼갠다 — 계수 c = Uᵀx', 14, 20);
        api.drawGrid(root, {
          x: 30, y: 46, cw: 36, ch: 26,
          nums: colMat(x), text: colMat(x).map(function (r) { return [num(r[0], 0)]; }),
          rowLabels: rowLabelsOf(g), colLabels: ['x']
        });
        api.drawBars(root, {
          x: 110, y: 46, w: 146, rowH: 26, zero: 180, scale: 9,
          values: c, labels: labels,
          text: c.map(function (t) { return num(t, 4); })
        });
        api.drawGrid(root, {
          x: 280, y: 46, cw: 40, ch: 26,
          nums: g.nodes.map(function (id, i) {
            return eig.vectors.map(function (u) { return u[i]; });
          }),
          text: g.nodes.map(function (id, i) {
            return eig.vectors.map(function (u) { return num(u[i], 3); });
          }),
          rowLabels: rowLabelsOf(g), colLabels: labels, negPattern: api.negPattern
        });
      }
    });

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 182],
      title: '② 두 합계가 맞는가',
      desc: '② 검산 — 막대 두 벌. 윗벌은 계수의 제곱 (' + sq2.map(f4).join(', ') + ')이고 합이 ' +
            f4(sumSq) + '이며 x의 제곱합 30과 같다. 아랫벌은 거기에 λ를 곱한 (' +
            lsq.map(f4).join(', ') + ')이고 합이 ' + f4(sumLsq) +
            '이며 S4의 거칢과 같다. 아랫벌에서 λ = 1.50 막대가 아랫벌 합의 ' +
            fx(lsq[2] / sumLsq * 100, 1) + '%다. 윗벌에서 같은 막대는 30의 ' +
            fx(sq2[2] / sumSq * 100, 1) + '%이고 가장 긴 막대는 ' + f4(sq2[0]) + '(' +
            fx(sq2[0] / sumSq * 100, 1) + '%)다.',
      caption: '② 윗벌 합은 x 의 제곱합과 같고, 아랫벌 합은 S4의 거칢과 같다. 아랫벌에서 ' +
               'λ = 1.50 막대가 아랫벌 합의 ' + fx(lsq[2] / sumLsq * 100, 1) +
               '%다 — 윗벌에서 같은 막대는 ' + fx(sq2[2] / sumSq * 100, 1) + '%뿐이다.',
      draw: function (root, api) {
        note(root, api, '윗벌 — 계수의 제곱 cₖ²', 14, 28);
        api.drawBars(root, {
          x: 96, y: 34, w: 180, rowH: 16, zero: 96, scale: 8,
          values: sq2, labels: labels, text: sq2.map(f4)
        });
        note(root, api, '합 ' + f4(sumSq), 322, 66);
        note(root, api, '아랫벌 — 거기에 λ 를 곱한 값', 14, 106);
        api.drawBars(root, {
          x: 96, y: 112, w: 180, rowH: 16, zero: 96, scale: 8,
          values: lsq, labels: labels, text: lsq.map(f4)
        });
        note(root, api, '합 ' + f4(sumLsq), 322, 144);
      }
    });

    return {
      id: 'spec-basis',
      title: '한 신호가 네 방향의 합으로',
      badge: LBADGE,
      caption: '계수 cₖ 는 모드마다 하나씩 붙는 양이라 격자가 아니라 막대다. ' +
               '왼쪽 격자의 행 순서는 정점 순서로 고정이다.',
      falsify: '네 방향이 서로 수직이 아니라면 ②의 두 합계 중 적어도 하나가 어긋나야 한다. ' +
               '둘 다 맞는다.',
      cols: 1,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-basis', anchor: 's7',
        data: { graphs: ['G4'], ops: ['L'] },
        frames: { count: 2, preset: 'wide', span: ['full', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawBars', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          // 폴백의 두 합계는 네 자리 소수라 명세에 베껴 적을 수 없다(§8 규약).
          // 숫자 대신 "무엇과 같은가"를 문장으로 묶어 둔다.
          numbers: [
            '(1, 2, 3, 4)',
            '(4.590, ' + MINUS + '0.986, ' + MINUS + '2.817, ' + MINUS + '0.169)',
            '95.6%', '26.4%', '70.2%'
          ],
          mustMention: ['x의 제곱합 30과 같다', 'S4의 거칢과 같다', '재정렬하지 않는다'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ── A4. spec-filter — S8 ─────────────────────────────── */

  function figSpecFilter() {
    var g = G.G4, o = gr.ops(g);
    var x = signalOf(g);
    var eig = la.jacobiEig(o.L);
    var c = flat(la.matmul(eig.vectors, colMat(x)));
    var labels = c.map(function (t, k) { return ulab(k); });

    // g(λ) = 1 − λ. 배수표를 곱하고 되돌린다 — 되돌리기는 Σ cₖ g(λₖ) uₖ 다.
    var gain = eig.values.map(function (l) { return 1 - l; });
    function rebuild(coef) {
      return g.nodes.map(function (id, i) {
        return coef.reduce(function (s, t, k) { return s + t * eig.vectors[k][i]; }, 0);
      });
    }
    var gc = c.map(function (t, k) { return t * gain[k]; });
    var top = rebuild(gc);
    var bottom = la.matvec(o.Ssym, x);

    // 배수표를 (1, 0, 0, 0)으로 바꾸면 가장 평평한 모드 하나만 남는다.
    var only = rebuild(c.map(function (t, k) { return k === 0 ? t : 0; }));
    var sqd = o.d.map(Math.sqrt);
    var ratio = only[0] / sqd[0];

    var frames = [];

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 150],
      title: '① 위 경로 — 쪼개고, 곱하고, 되돌린다',
      desc: '① 위 경로 — x의 격자에서 출발해 계수 막대 ' + vecText(c, 3) +
            '로 쪼개고, 막대마다 배수 ' + gain.map(function (v) { return num(v, 2); }).join(', ') +
            '을 옆에 적어 곱한 뒤 ' + vecText(gc, 3) + ' 막대를 얻고, 되돌려 격자 ' +
            vecText(top, 3) + '를 얻는다. 고유분해를 쓴다.',
      caption: '① 배수는 막대를 한 벌 더 그리지 않고 계수 막대 옆에 값으로 적는다. ' +
               '막대 두 벌은 모드 축 위의 양이고 격자 두 벌은 정점 축 위의 양이다.',
      draw: function (root, api) {
        heading(root, api, 'x → c → g(λ)·c → 되돌린 값', 14, 18);
        api.drawGrid(root, {
          x: 26, y: 40, cw: 32, ch: 24,
          nums: colMat(x), text: colMat(x).map(function (r) { return [num(r[0], 0)]; }),
          rowLabels: rowLabelsOf(g), colLabels: ['x']
        });
        api.drawBars(root, {
          x: 80, y: 40, w: 125, rowH: 24, zero: 140, scale: 6,
          values: c, labels: labels, text: c.map(function (t) { return num(t, 3); }),
          notes: gain.map(function (v) { return '× ' + num(v, 2); })
        });
        api.drawBars(root, {
          x: 266, y: 40, w: 108, rowH: 24, zero: 312, scale: 6,
          values: gc, labels: labels, text: gc.map(function (t) { return num(t, 3); })
        });
        api.drawGrid(root, {
          x: 392, y: 40, cw: 44, ch: 24,
          nums: colMat(top), text: colMat(top).map(function (r) { return [num(r[0], 3)]; }),
          colLabels: ['되돌림']
        });
      }
    });

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 150],
      title: '② 아래 경로 — 이웃을 한 번 섞는다',
      desc: '② 아래 경로 — 같은 x의 격자에서 출발해 G4 위에서 계수 ' +
            dot3(o.Ssym[0][1]) + ' 과 ' + dot3(o.Ssym[0][2]) +
            ' 으로 이웃을 한 번 섞어 같은 격자 ' + vecText(bottom, 3) +
            '를 얻는다. 고유분해를 쓰지 않는다.',
      caption: '② 고유분해가 한 번도 등장하지 않는다. 계수는 간선 위에만 있다.',
      draw: function (root, api) {
        heading(root, api, 'x → 간선 계수로 한 번 섞기 → 결과', 14, 18);
        api.drawGrid(root, {
          x: 24, y: 40, cw: 36, ch: 24,
          nums: colMat(x), text: colMat(x).map(function (r) { return [num(r[0], 0)]; }),
          rowLabels: rowLabelsOf(g), colLabels: ['x']
        });
        var gg = placed(root, api, 90, 8);
        var roles = {};
        g.nodes.forEach(function (id) { roles[id] = 'active'; });
        api.drawGraph(gg, {
          graph: g, arrow: api.arrow, roles: roles,
          edgeLabel: function (a, b) { return dot3(o.Ssym[o.idx[a]][o.idx[b]]); },
          edgeWidth: function (a, b) { return o.Ssym[o.idx[a]][o.idx[b]]; }
        });
        api.drawGrid(root, {
          x: 384, y: 40, cw: 44, ch: 24,
          nums: colMat(bottom),
          text: colMat(bottom).map(function (r) { return [num(r[0], 3)]; }),
          colLabels: ['Sx']
        });
      }
    });

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 166],
      title: '③ 두 끝이 같은가',
      // "두 열의 비"는 한 열 안의 행끼리 비(√2 : √2 : 1 : 1)와 두 열을 행마다 나눈 값
      // (네 행 모두 1.874)을 동시에 가리켜 중의적이다. 낱말을 갈라 쓴다.
      desc: '③ 두 경로의 끝 격자를 나란히 놓고 같은 테로 묶은 것. 네 자리 소수까지 같다. ' +
            '그 옆에 배수표만 (1, 0, 0, 0)으로 바꾼 결과 격자 ' + vecText(only, 3) +
            '를 √d 격자 ' + vecText(sqd, 3) + '와 나란히 두어, 결과 열이 √d 열과 같은 모양 ' +
            '√2 : √2 : 1 : 1 임을 보인다.',
      caption: '③ 두 끝 격자가 네 자리 소수까지 같다. 오른쪽 두 격자는 배수표를 하나만 ' +
               '남겼을 때인데, 두 격자를 행마다 나눈 값이 네 행 모두 ' + fx(ratio, 3) +
               ' 로 같다 — 결과 열이 √d 에 정확히 비례한다는 뜻이다.',
      draw: function (root, api) {
        var a = api.drawGrid(root, {
          x: 62, y: 50, cw: 48, ch: 24,
          nums: colMat(top), text: colMat(top).map(function (r) { return [num(r[0], 4)]; }),
          rowLabels: rowLabelsOf(g), colLabels: ['위 경로']
        });
        var b = api.drawGrid(root, {
          x: 118, y: 50, cw: 48, ch: 24,
          nums: colMat(bottom),
          text: colMat(bottom).map(function (r) { return [num(r[0], 4)]; }),
          colLabels: ['아래 경로']
        });
        ringAround(root, api, a, b);
        note(root, api, '배수표를 (1, 0, 0, 0) 으로 바꾸면', 262, 34);
        api.drawGrid(root, {
          x: 266, y: 50, cw: 52, ch: 24,
          nums: colMat(only), text: colMat(only).map(function (r) { return [num(r[0], 4)]; }),
          colLabels: ['결과']
        });
        api.drawGrid(root, {
          x: 332, y: 50, cw: 52, ch: 24,
          nums: colMat(sqd), text: colMat(sqd).map(function (r) { return [num(r[0], 4)]; }),
          colLabels: ['√d']
        });
        note(root, api, '행마다 나눈 값이 네 행 모두 ' + fx(ratio, 3) + ' 다', 262, 160);
      }
    });

    return {
      id: 'spec-filter',
      title: '모드에서 곱하기가 정점에서 이웃 섞기다',
      badge: LBADGE,
      caption: '위 경로는 고유분해를 쓰고 아래 경로는 쓰지 않는데 끝이 같다. ' +
               '이것이 식 (3)이 정의하는 전부다.',
      falsify: '식 (3)이 정점 축 연산과 무관한 별개의 정의라면 ③의 두 끝 격자가 달라야 한다. ' +
               '네 자리 소수까지 같다.',
      cols: 1,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-filter', anchor: 's8',
        data: { graphs: ['G4'], ops: ['L', 'Ssym', 'd', 'idx'] },
        frames: { count: 3, preset: 'wide', span: ['full', 'full', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawBars', 'drawGraph', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: [
            '(4.590, ' + MINUS + '0.986, ' + MINUS + '2.817, ' + MINUS + '0.169)',
            '1.00, 0.50, ' + MINUS + '0.50, ' + MINUS + '1.00',
            '(3.121, 3.328, 0.707, 1.414)', '(1, 0, 0, 0)', '1.874'
          ],
          mustMention: ['고유분해를 쓰지 않는다', '√2 : √2 : 1 : 1'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ── A5. spec-hop — S10 ───────────────────────────────── */

  function figSpecHop() {
    var g = G.G4, o = gr.ops(g);
    var center = 3, ci = o.idx[center];
    var dist = gr.hopDistance(g, center);

    var frames = [1, 2, 3].map(function (k, fi) {
      var row = la.matpow(o.L, k)[ci];
      var inside = g.nodes.filter(function (id) { return dist[id] <= k; });
      var far = row[o.idx[4]];
      return {
        span: 'full',
        vb: [0, 0, 452, 168],
        title: 'k = ' + k + ' — 테 안 ' + inside.length + '개',
        desc: ORD[fi] + ' k = ' + k + ' 프레임. G4 위에 ' + k +
              '걸음 이내 정점을 감싸는 테를 그리고, 그 옆에 (L' + sup(k) +
              ')의 3행을 격자 한 줄로 적는다. 테 안은 ' +
              inside.map(function (id) { return 'v' + id; }).join(', ') + ' 이고 3행은 ' +
              vecText(row, 3) + ' 이다. 테 밖 칸은 0이다.',
        caption: ORD[fi] + ' 테 안 ' + inside.length + '개 · (L' + sup(k) + ')₃₄ = ' +
                 num(far, 3) + (Math.abs(far) < 1e-9
                   ? ' — v₄ 칸이 아직 0이다.'
                   : ' — 여기서 처음 0이 아니게 된다.'),
        draw: function (root, api) {
          // 테가 정점 이름표(원반 아래)와 걸음표(원반 위)를 가로지르지 않도록
          // pad 를 16으로 벌리고, 그만큼 그래프를 오른쪽으로 8 옮겨 테 왼쪽을 vb 안에 둔다.
          var gg = placed(root, api, 8, 20);
          var roles = {}, marks = {};
          g.nodes.forEach(function (id) {
            var on = dist[id] <= k;
            roles[id] = id === center ? 'focus' : (on ? 'active' : 'out');
            marks[id] = on ? (dist[id] + 'h') : '';
          });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: roles, marks: marks,
            rings: [{ members: inside, pad: 16, label: 'k ≤ ' + k }],
            edgeState: function (a, b) {
              return (dist[a] <= k && dist[b] <= k) ? 'on' : 'off';
            }
          });
          api.drawGrid(root, {
            x: 276, y: 84, cw: 36, ch: 24,
            nums: [row], text: [row.map(function (v) { return dot3(v); })],
            colLabels: rowLabelsOf(g),
            heading: 'k = ' + k + ' · L' + sup(k) + '의 3행', negPattern: api.negPattern
          });
        }
      };
    });

    return {
      id: 'spec-hop',
      title: 'K차 다항식은 K걸음 밖을 보지 않는다',
      badge: LBADGE,
      caption: '테는 수용 영역(이진 집합)이고 격자 한 줄은 실제 계수다. ' +
               '두 집합이 같은 프레임이 셋이다.',
      falsify: 'K차 다항식이 K걸음 밖을 본다면 k = 2 프레임의 v4 칸이 0이 아니어야 한다. ' +
               '0이다. 그리고 k = 3에서 처음으로 0이 아니게 된다.',
      cols: 1,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-hop', anchor: 's10',
        data: { graphs: ['G4'], ops: ['L', 'idx'] },
        frames: { count: 3, preset: 'wide', span: ['full', 'full', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawGraph', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['k = 1, 2, 3', '(' + MINUS + '0.707, 0, 1, 0)',
            MINUS + '0.250', '{v3, v1, v2}'],
          mustMention: ['테 밖 칸', '3행'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ── A6. spec-cheby — S11 ─────────────────────────────── */

  function figSpecCheby() {
    var g = G.G4, o = gr.ops(g);
    var T = la.cheby(o.Ltilde, 2);
    var lm = gr.ops(G.G4circ).lmax;
    var names = ['T₀(L̃) = I', 'T₁(L̃) = L̃', 'T₂(L̃) = 2L̃² − I'];
    var scale = 1;

    function frameK(k) {
      var M = T[k];
      var loops = {};
      g.nodes.forEach(function (id) {
        loops[id] = { label: dot3(M[o.idx[id]][o.idx[id]]), dx: loopDx(id),
                      width: Math.abs(M[o.idx[id]][o.idx[id]]) / scale };
      });
      var edgeVal = function (a, b) { return M[o.idx[a]][o.idx[b]]; };
      var full = k === 2;

      return {
        span: full ? 'full' : undefined,
        // 세 프레임이 같은 viewBox와 같은 배치를 쓴다. ③이 가로를 다 차지해도
        // 정점은 ①②와 같은 자리에 찍힌다 — 읽는 이가 프레임을 옮길 때마다
        // 정점을 다시 찾지 않아도 된다. 재척도 눈금 축은 본문(S11)이 이미
        // 한 줄로 찍으므로 여기서 그리지 않는다.
        vb: [0, 0, 330, 176],
        title: ORD[k] + ' ' + names[k],
        desc: ORD[k] + ' ' + names[k] + ' — 자기 고리가 ' +
              g.nodes.map(function (id) {
                return 'v' + id + ' ' + num(M[o.idx[id]][o.idx[id]], 3);
              }).join(', ') + ' 이고 1-hop 간선 (1,2), (1,3), (2,4)는 ' +
              g.edges.map(function (e) { return num(edgeVal(e[0], e[1]), 3); }).join(', ') +
              ' 이다.' + (full
                ? ' 그래서 2-hop 쌍 (1,4)와 (2,3)에 ' + num(M[0][3], 3) +
                  ' 이 붙고, 그래프에 없던 쌍을 잇는 점찍은 현 두 개가 등장한다.'
                : ' 선 굵기는 계수 크기에 맞춘다.'),
        caption: full
          ? ORD[k] + ' 1-hop 세 쌍이 전부 0이고 2-hop 두 쌍에 ' + dot3(M[0][3]) +
            ' 이 붙는다. 짝수 차수 항은 홀수 거리에 닿지 않는다 — 그림이 틀린 것이 아니다. ' +
            '점찍은 현 두 개는 배선에 없는데 계수에는 값이 있는 쌍이다. 그리고 G4○(= G4 + v₅, ' +
            '간선 (3,5)(4,5))에서는 λ_max = ' + fx(lm, 3) + ' 라 2/λ_max = ' +
            fx(2 / lm, 3) + ' 이다. 논문이 λ_max ≈ 2 근사를 쓰는 것은 K = 1 로 자른 뒤(§2.2)이고, ' +
            '식 (5)의 Chebyshev 모델은 정확한 λ_max 를 쓴다.'
          : (k === 0
            ? ORD[k] + ' 0차는 아무도 섞지 않는다. 자기 고리만 ' +
              num(M[0][0], 3) + ' 이다.'
            : ORD[k] + ' 1차는 1-hop 간선에만 값을 준다. λ_max = 2 인 G4에서 L̃ = L − I = −S 다.'),
        draw: function (root, api) {
          var gg = placed(root, api, 0, 34);
          var roles = {};
          g.nodes.forEach(function (id) { roles[id] = 'active'; });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: roles, selfLoops: loops,
            edgeLabel: function (a, b) { return dot3(edgeVal(a, b)); },
            edgeWidth: function (a, b) { return Math.abs(edgeVal(a, b)) / scale; },
            extraEdges: full ? [
              { a: 1, b: 4, label: dot3(M[o.idx[1]][o.idx[4]]),
                width: Math.abs(M[o.idx[1]][o.idx[4]]) / scale },
              // 2–3 현의 숫자 상자는 기본 자리(현의 중점에서 수직 9)가 v1의
              // 이름표 위에 얹힌다. 반대쪽으로 22 띄워 두 현이 교차하는 아래쪽
              // 빈자리에 둔다 — 값도 현의 좌표도 그대로다.
              { a: 2, b: 3, label: dot3(M[o.idx[2]][o.idx[3]]),
                width: Math.abs(M[o.idx[2]][o.idx[3]]) / scale, labelOff: -22 }
            ] : null
          });
        }
      };
    }

    var frames = [0, 1, 2].map(frameK);

    return {
      id: 'spec-cheby',
      title: '기성품 세 벌의 계수표',
      badge: 'G4 · L̃ = (2/λ_max)L − I',
      caption: 'T₀ 는 아무도 섞지 않고, T₁ 은 1-hop만, T₂ 는 1-hop을 건너뛴다. ' +
               '셋째 프레임이 왜 고장이 아닌지는 본문이 미리 밝혀 둔다.',
      falsify: '"K차 다항식 = K걸음 전부"가 맞다면 ③에서 1-hop 세 간선이 0이 아니어야 한다. ' +
               '셋 다 0이다.',
      cols: 2,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-cheby', anchor: 's11',
        data: { graphs: ['G4', 'G4circ'], ops: ['Ltilde', 'lmax', 'idx'] },
        frames: { count: 3, preset: 'half', span: ['auto', 'auto', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawGraph'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['1.000', MINUS + '.500', MINUS + '.707', '.500', '.707'],
          mustMention: ['점찍은 현'],
          // ③의 재척도 눈금 축은 본문(S11)이 맡기로 하고 그림에서 뺐다.
          // 폴백이 없는 축을 말하면 무JS 독자가 있지도 않은 것을 찾게 된다.
          mustNotMention: ['축', '눈금']
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ── A7. spec-explode — S13 ───────────────────────────── */

  function figSpecExplode() {
    var g = G.G4, o = gr.ops(g);
    var x = signalOf(g);
    var KS = [0, 1, 4, 8];
    var DEC = { 0: 0, 1: 2, 4: 1, 8: 0 };
    var res = KS.map(function (k) { return la.matvec(la.matpow(o.Iplus, k), x); });
    var eigL = la.jacobiEig(o.L);
    var eigI = la.jacobiEig(o.Iplus);
    var top = eigI.values[eigI.values.length - 1];
    // 가장 평평한 모드는 L의 λ 최솟값 방향이다. I + S = 2I − L 이므로 같은 방향이
    // 그쪽에서는 가장 큰 눈금에 붙는다 — 그 자리를 두 줄에서 각각 표시한다.
    var flatVec = eigL.vectors[0];
    function isFlat(vec) {
      return vec.every(function (t, i) { return Math.abs(t - flatVec[i]) < 1e-9; });
    }
    function markLabel(eig, k) {
      return fx(eig.values[k], 2) + (isFlat(eig.vectors[k]) ? ' 평평' : '');
    }
    var frames = [];

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 160],
      title: '① 한 번은 멀쩡하고 여덟 번은 아니다',
      desc: '① 반복 — G4 위에 I + S의 계수를 적은 그림(자기 고리 넷 다 ' +
            num(o.Iplus[0][0], 3) + ', 간선 ' + num(o.Iplus[0][1], 3) + ' / ' +
            num(o.Iplus[0][2], 3) + ' / ' + num(o.Iplus[1][3], 3) +
            ')과 그 오른쪽에 k = 0, 1, 4, 8의 결과 격자 네 개. ' +
            res.map(function (v, i) { return vecText(v, DEC[KS[i]]); }).join(' → ') +
            '로 자릿수가 늘어난다.',
      caption: '① 원반 위 계수 가운데 1을 넘는 것이 하나도 없는데 결과의 정수 자릿수가 ' +
               '한 자리에서 세 자리로 자란다.',
      draw: function (root, api) {
        var gg = placed(root, api, 0, 14);
        var roles = {}, loops = {};
        g.nodes.forEach(function (id) {
          roles[id] = 'active';
          loops[id] = { label: dot3(o.Iplus[o.idx[id]][o.idx[id]]), dx: loopDx(id),
                        width: o.Iplus[o.idx[id]][o.idx[id]] };
        });
        api.drawGraph(gg, {
          graph: g, arrow: api.arrow, roles: roles, selfLoops: loops,
          edgeLabel: function (a, b) { return dot3(o.Iplus[o.idx[a]][o.idx[b]]); },
          edgeWidth: function (a, b) { return o.Iplus[o.idx[a]][o.idx[b]]; }
        });
        KS.forEach(function (k, i) {
          api.drawGrid(root, {
            x: 256 + i * 50, y: 44, cw: 44, ch: 24,
            text: colMat(res[i]).map(function (r) { return [num(r[0], DEC[k])]; }),
            colLabels: ['k = ' + k],
            rowLabels: i === 0 ? rowLabelsOf(g) : null
          });
        });
      }
    });

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 160],
      title: '② 눈금은 뒤집히기만 했다',
      desc: '② 눈금 — 1차원 축 한 줄에 두 행을 겹친다. 위 행은 L의 눈금 ' +
            eigL.values.map(function (v) { return fx(v, 2); }).join(', ') +
            ', 아래 행은 I + S의 눈금 ' +
            eigI.values.map(function (v) { return fx(v, 2); }).join(', ') +
            '이다. G4에서는 네 눈금 위치까지 같고, 다만 가장 평평한 모드가 L에서는 ' +
            '왼쪽 끝 0에, I + S에서는 오른쪽 끝 2에 있다. 두 줄에서 그 눈금 하나에만 ' +
            '"평평" 표시를 붙인다. 축 오른쪽 끝에 ' +
            '2의 8제곱 = ' + num(Math.pow(top, 8), 0) + '을 적는다.',
      caption: '② I + S = 2I − L 이므로 두 연산자의 고유벡터 집합은 완전히 같고 눈금만 ' +
               'λ ↦ 2 − λ 로 뒤집힌다. G4에서는 눈금 위치까지 같은데, 그것은 G4가 양쪽으로 ' +
               '갈리는 그래프여서다 — 일반적으로 같은 것은 고유벡터이고 눈금은 통째로 ' +
               '옮겨 간다. 가장 평평한 모드가 왼쪽 끝에서 오른쪽 끝으로 갔다.',
      draw: function (root, api) {
        heading(root, api, '같은 네 눈금, 반대 끝의 평평한 모드', 14, 24);
        // 줄 이름은 대본 A7이 적은 대로 L / I + S 다. 짧게 두어야 축을 넓게 쓸 수 있고,
        // 그래야 "평평" 표시가 이웃 눈금 라벨과 겹치지 않는다.
        var ax = api.drawAxis(root, {
          x: 96, y: 52, w: 300, min: -0.15, max: 2.15, rowH: 28,
          rows: [
            { label: 'L', marks: eigL.values.map(function (v, k) {
              return { v: v, label: markLabel(eigL, k) }; }) },
            { label: 'I + S', marks: eigI.values.map(function (v, k) {
              return { v: v, label: markLabel(eigI, k), shape: 'square' }; }) }
          ],
          ticks: [{ v: 0, label: '0' }, { v: 1, label: '1' }, { v: 2, label: '2' }],
          // 캡션 슬롯은 축 왼쪽 시작점에 찍힌다. 위치를 주장하는 문구를 여기 두면
          // 정확히 반대쪽을 가리키게 된다 — 중립적인 축 이름만 남긴다.
          caption: 'λ 축'
        });
        // 축 오른쪽 끝 글자도 caption(왼쪽 시작점)에 넣을 수 없다.
        note(root, api, '2⁸ = ' + num(Math.pow(top, 8), 0), ax.at(top) + 10, 90);
      }
    });

    return {
      id: 'spec-explode',
      title: '계수는 1을 안 넘는데 결과는 부푼다',
      badge: 'G4 · I + D⁻¹ᐟ²AD⁻¹ᐟ²',
      caption: '반복이 하는 일은 곱셈이 아니라 거듭제곱이다. 원인은 계수가 아니라 ' +
               '오른쪽 끝 눈금이다.',
      falsify: 'I + S 의 폭발이 계수 하나가 커서 생긴 것이라면 ①의 원반에 1을 넘는 계수가 ' +
               '있어야 한다. 없다. 원인은 ②의 오른쪽 끝 눈금 2.00이다. 다만 두 줄의 눈금이 ' +
               '겹치는 것은 G4의 사정이지 동치의 증거가 아니다.',
      cols: 1,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-explode', anchor: 's13',
        data: { graphs: ['G4'], ops: ['Iplus', 'L', 'idx'] },
        frames: { count: 2, preset: 'wide', span: ['full', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawAxis', 'drawGraph', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['1.000', '(1, 2, 3, 4)', '(4.12, 5.33, 3.71, 5.41)',
            '(668, 689, 465, 494)', '0, 0.50, 1.50, 2.00', '2⁸ = 256'],
          mustMention: ['평평한 모드', '1차원 축'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ── A8. spec-swap — S14 ──────────────────────────────── */

  function figSpecSwap() {
    var g = G.G4, o = gr.ops(g);
    // 두 프레임의 굵기 기준은 같은 값이어야 비교가 뜻을 갖는다. 두 행렬 전체의 최댓값.
    var scale = 0;
    [o.Iplus, o.Ahat].forEach(function (M) {
      M.forEach(function (r) {
        r.forEach(function (v) { scale = Math.max(scale, Math.abs(v)); });
      });
    });

    function frameOf(i) {
      var M = i === 0 ? o.Iplus : o.Ahat;
      var deg = i === 0 ? o.d : o.dt;
      var ratio = M[0][0] / M[o.idx[1]][o.idx[3]];
      return {
        vb: [0, 0, 330, 180],
        title: ORD[i] + (i === 0 ? ' 식 (7)의 계수' : ' 식 (8)의 계수'),
        desc: ORD[i] + (i === 0 ? ' I + S — ' : ' Â — ') + '같은 G4 배선 위에 자기 고리와 ' +
              '간선의 계수를 숫자로 적고 선 굵기를 계수에 맞춘 것. 자기 고리는 ' +
              g.nodes.map(function (id) {
                return 'v' + id + ' ' + num(M[o.idx[id]][o.idx[id]], 3);
              }).join(', ') + ' 이고, 간선은 (1,2)가 ' + num(M[o.idx[1]][o.idx[2]], 3) +
              ', (1,3)과 (2,4)가 ' + num(M[o.idx[1]][o.idx[3]], 3) + ' 이다. 차수는 ' +
              (i === 0 ? 'd = ' : 'd̃ = ') + vecText(deg, 0) + ' 다.',
        caption: ORD[i] + ' ' + (i === 0 ? 'd = ' : 'd̃ = ') + vecText(deg, 0) + '. ' +
                 '자기 고리가 간선 (1,3)보다 ' + (ratio > 1 ? '굵다' : '가늘다') + ' — 비 ' +
                 fx(ratio, 3) + '.' + (i === 0 ? '' : ' 배선은 한 선도 바뀌지 않았다.'),
        draw: function (root, api) {
          var gg = placed(root, api, 0, 16);
          var roles = {}, loops = {};
          g.nodes.forEach(function (id) {
            roles[id] = 'active';
            loops[id] = { label: dot3(M[o.idx[id]][o.idx[id]]), dx: loopDx(id),
                          width: M[o.idx[id]][o.idx[id]] / scale };
          });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: roles, selfLoops: loops,
            edgeLabel: function (a, b) { return dot3(M[o.idx[a]][o.idx[b]]); },
            edgeWidth: function (a, b) { return M[o.idx[a]][o.idx[b]] / scale; }
          });
        }
      };
    }

    return {
      id: 'spec-swap',
      title: '배선은 그대로, 숫자만 바꿔 끼운다',
      badge: 'G4 · Â = D̃⁻¹ᐟ²ÃD̃⁻¹ᐟ²',
      caption: '자기 고리만 줄어든 것이 아니다. 간선 계수도 함께 바뀌어 v₁ 의 자기/이웃 비가 ' +
               '뒤집힌다.',
      falsify: 'renormalization이 자기 고리만 줄인 것이라면 ①과 ②의 간선 숫자가 같아야 한다. ' +
               '셋 다 바뀐다.',
      cols: 2,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-swap', anchor: 's14',
        data: { graphs: ['G4'], ops: ['Ahat', 'Iplus', 'd', 'dt', 'idx'] },
        frames: { count: 2, preset: 'half', span: ['auto', 'auto'], safeArea: SAFE },
        primitives: ['S', 'drawGraph'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['1.000', '.500', '.707', '.333', '.408', 'd̃ = (3, 3, 2, 2)'],
          mustMention: ['자기 고리', '배선은 한 선도 바뀌지 않았고'],
          mustNotMention: []
        }
      },
      frames: function () { return [frameOf(0), frameOf(1)]; }
    };
  }

  /* ── A9. spec-mu — S15 ────────────────────────────────── */

  function figSpecMu() {
    var g = G.G4, o = gr.ops(g);
    var x = signalOf(g);
    var eigI = la.jacobiEig(o.Iplus);
    var eigA = la.jacobiEig(o.Ahat);
    var eigL = la.jacobiEig(o.L);
    var mu = eigA.values[2];
    var KS = [1, 2, 4, 8];
    var hk = KS.map(function (k) { return la.matvec(la.matpow(o.Ahat, k), x); });
    var blow = la.matvec(la.matpow(o.Iplus, 8), x);
    var sqdt = o.dt.map(Math.sqrt);
    // 0인 두 성분은 수치적으로 ±1e−17 이라 그대로 두면 막대가 0선의 서로 반대쪽에
    // 놓인다. 규약 8이 부호를 "0선의 어느 쪽인가"로 읽게 하므로 임계값 아래를 눌러 둔다.
    var comp = flat(la.matmul(eigL.vectors, colMat(sqdt)))
      .map(function (t) { return Math.abs(t) < 1e-9 ? 0 : t; });
    var labels = comp.map(function (t, k) { return ulab(k); });
    var nonzero = comp.filter(function (t) { return Math.abs(t) > 1e-9; }).length;
    var frames = [];

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 120],
      title: '① 눈금이 안쪽으로 죄어진다',
      desc: '① 눈금 — 1차원 축 한 줄에 두 행을 겹친다. 위 행은 I + S의 눈금 ' +
            eigI.values.map(function (v) { return fx(v, 2); }).join(', ') +
            '이고, 아래 행은 Â의 눈금 ' +
            eigA.values.map(function (v) { return num(v, 3); }).join(', ') +
            '이다. 아래 행이 (−1, 1] 안으로 죄어져 있고, G4에서는 없던 음수 눈금이 ' +
            '새로 하나 생겼다.',
      caption: '① 가장 큰 눈금이 정확히 ' + fx(eigA.values[3], 3) + '이 되고, G4에서는 없던 ' +
               '음수 눈금이 새로 하나 생긴다. 두 줄의 관계는 Â = I − L(G̃) 한 줄이다.',
      draw: function (root, api) {
        // 줄 이름은 대본 A9가 적은 대로 I + S / Â 다. 긴 정의식을 줄 이름에 넣으면
        // 축이 좁아져 Â 행의 이웃한 두 눈금 라벨(0.729와 1.000)이 서로 겹친다.
        // 정의는 이 프레임의 캡션 "Â = I − L(G̃)" 한 줄과 배지가 맡는다.
        api.drawAxis(root, {
          x: 48, y: 34, w: 392, min: -1.15, max: 2.15, rowH: 26,
          rows: [
            { label: 'I + S', marks: eigI.values.map(function (v) {
              return { v: v, label: fx(v, 2), shape: 'square' }; }) },
            { label: 'Â', marks: eigA.values.map(function (v) {
              return { v: v, label: num(v, 3), shape: 'tri' }; }) }
          ],
          ticks: [-1, 0, 1, 2].map(function (v) {
            return { v: v, label: num(v, 0) };
          }),
          caption: '안쪽으로 죄어진다'
        });
      }
    });

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 172],
      title: '② 여덟 층 뒤',
      desc: '② 반복 — Â를 k = 1, 2, 4, 8번 적용한 결과 ' +
            hk.map(function (v) { return vecText(v, 2); }).join(', ') +
            '을 격자 네 개로 늘어놓고, 같은 k = 8에서 I + S가 준 세 자릿수 격자 ' +
            vecText(blow, 1) + '를 아래에 나란히 적는다.',
      caption: '② 같은 k = 8에서 한 자릿수 대 세 자릿수다. 대가는 나머지 모드가 μ = ' +
               fx(mu, 4) + ' 의 8제곱, 곧 ' + fx(Math.pow(mu, 8), 4) + ' 로 죽는 것이다.',
      draw: function (root, api) {
        heading(root, api, 'Â 를 k 번 적용한 결과', 14, 24);
        KS.forEach(function (k, i) {
          api.drawGrid(root, {
            x: 70 + i * 90, y: 48, cw: 52, ch: 24,
            text: colMat(hk[i]).map(function (r) { return [num(r[0], 2)]; }),
            colLabels: ['k = ' + k],
            rowLabels: i === 0 ? rowLabelsOf(g) : null
          });
        });
        note(root, api, '같은 k = 8에서 (I + S)⁸x = ' + vecText(blow, 1), 70, 164);
      }
    });

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 166],
      title: '③ 반증 — 성분이 둘이다',
      desc: '③ 반증 — 왼쪽에 Â의 μ = ' + fx(eigA.values[3], 3) + ' 모드인 √d̃ = ' +
            vecText(sqdt, 3) + '를 격자로, 오른쪽에 그것을 L의 네 모드로 분해한 막대 네 개 ' +
            comp.map(function (t) { return num(t, 3); }).join(', ') +
            '를 그린다. 0이 아닌 막대가 ' + countKo(nonzero) + '이다.',
      caption: '③ 0이 아닌 막대가 ' + countKo(nonzero) +
               '이다. 하나였다면 Â 는 L 의 필터일 수 있었다.',
      draw: function (root, api) {
        heading(root, api, '√d̃ 를 L 의 네 모드로 분해하면', 14, 24);
        api.drawGrid(root, {
          x: 70, y: 48, cw: 54, ch: 24,
          nums: colMat(sqdt), text: colMat(sqdt).map(function (r) { return [num(r[0], 3)]; }),
          rowLabels: rowLabelsOf(g), colLabels: ['√d̃']
        });
        api.drawBars(root, {
          x: 204, y: 48, w: 150, rowH: 24, zero: 254, scale: 30,
          values: comp, labels: labels,
          text: comp.map(function (t) { return num(t, 3); })
        });
      }
    });

    return {
      id: 'spec-mu',
      title: '눈금은 죄어지고, 기저는 바뀐다',
      badge: 'G4 · Â = D̃⁻¹ᐟ²ÃD̃⁻¹ᐟ²',
      caption: '세 가지를 나눠 확인한다. 프레임마다 판정이 하나씩 붙는다.',
      falsify: '동치를 깨는 것은 ①의 눈금 범위가 아니라 ③의 기저다 — Â 의 네 눈금이 서로 ' +
               '다르므로, Â 가 식 (3)의 필터라면 그 모드는 정확히 L 의 네 모드여야 한다. ' +
               '③이 검사하는 것이 그 조건이고, 막대가 하나가 아니면 필터가 아니다.',
      cols: 1,
      contract: {
        page: '05_spectral_bridge.md', slot: 'spec-mu', anchor: 's15',
        data: { graphs: ['G4'], ops: ['Ahat', 'Iplus', 'L', 'dt'] },
        frames: { count: 3, preset: 'wide', span: ['full', 'full', 'full'], safeArea: SAFE },
        primitives: ['S', 'drawAxis', 'drawBars', 'drawGrid'],
        text: { maxChars: { heading: 34, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: [
            MINUS + '0.229, 0.167, 0.729, 1.000',
            '(2.22, 2.63, 1.91, 2.82)', '(2.59, 2.64, 2.09, 2.18)',
            '(1.732, 1.732, 1.414, 1.414)',
            '3.155, 0.000, ' + MINUS + '0.219, 0.000'
          ],
          mustMention: ['0이 아닌 막대가 둘이다'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ══════════════════════════════════════════════════════════
   * F7. 전 정점 forward vs 라벨 손실 마스크 — 02 §7 (#viz-semi-supervised)
   * ════════════════════════════════════════════════════════ */

  function figSemi() {
    var g = G.G4;
    var W0 = [[1, -1], [-1, 1]];
    var W1 = [[1, 0], [0, 1]];
    var LABELED = [1, 4];
    var Y = { 1: 0, 4: 1 };   // 정답 클래스 인덱스

    function forward(graph) {
      var op = gr.ops(graph);
      var Xs = graph.nodes.map(function (id) { return g.X[id].slice(); });
      var H1 = la.relu(la.matmul(la.matmul(op.Ahat, Xs), W0));
      var Z = la.softmaxRows(la.matmul(la.matmul(op.Ahat, H1), W1));
      return { ids: graph.nodes, Z: Z, idx: op.idx };
    }

    var full = forward(g);
    var cut = forward(gr.subgraph(g, [1, 2, 4]));

    function lossOf(res) {
      return LABELED.reduce(function (a, id) {
        var r = res.idx[id];
        return r == null ? a : a - Math.log(res.Z[r][Y[id]]);
      }, 0);
    }

    function baseRoles(mode) {
      var r = {};
      g.nodes.forEach(function (id) {
        if (mode === 'mask' && LABELED.indexOf(id) >= 0) r[id] = 'labeled';
        else if (mode === 'cut' && id === 3) r[id] = 'out';
        else r[id] = 'active';
      });
      return r;
    }

    function zGrid(root, api, res, x) {
      var text = g.nodes.map(function (id) {
        var r = res.idx[id];
        if (r == null) return ['—', '—'];
        return [fx(res.Z[r][0], 3), fx(res.Z[r][1], 3)];
      });
      var nums = g.nodes.map(function (id) {
        var r = res.idx[id];
        return r == null ? [0, 0] : res.Z[r];
      });
      return api.drawGrid(root, {
        x: x, y: 46, cw: 44, ch: 24, nums: nums, text: text,
        rowLabels: rowLabelsOf(g), colLabels: ['c' + sub(1), 'c' + sub(2)],
        heading: 'Z = softmax(·)', scale: 1
      });
    }

    var SVB = [0, 0, 446, 200];
    var frames = [
      {
        span: 'full', vb: SVB,
        title: '전 정점 forward',
        desc: '라벨이 두 개뿐이어도 Z는 네 정점 전부에서 계산된다. ' +
              g.nodes.map(function (id, i) {
                return 'v' + id + ' ' + full.Z[i][0].toFixed(3) + '/' + full.Z[i][1].toFixed(3);
              }).join(', ') + '.',
        caption: '① forward — 네 행이 모두 `active`. 마스크는 아직 등장하지 않는다.',
        draw: function (root, api) {
          heading(root, api, '① 2층 forward: Z = softmax(Â ReLU(ÂXW⁽⁰⁾) W⁽¹⁾)', 10, 16);
          var gg = placed(root, api, 8, 22);
          var vals = {};
          g.nodes.forEach(function (id, i) { vals[id] = fx(full.Z[i][0], 2); });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: baseRoles('fwd'), values: vals
          });
          zGrid(root, api, full, 300);
        }
      },
      {
        span: 'full', vb: SVB,
        title: '손실 마스크는 행 선택이지 행 삭제가 아니다',
        desc: '라벨 있는 v1, v4에만 −ln Z 항이 생긴다. 손실 합은 ' +
              lossOf(full).toFixed(3) + '이다. v2, v3의 행은 그대로 계산되어 있다.',
        caption: '② 손실 — 이중 테두리가 라벨 집합 Yₗ. 손실 칸은 그 두 행 옆에만 붙는다.',
        draw: function (root, api) {
          heading(root, api, '② 손실 ℒ = −Σ (l ∈ Yₗ) ln Z(l, y)', 10, 16);
          var gg = placed(root, api, 8, 22);
          var vals = {}, marks = {};
          g.nodes.forEach(function (id, i) {
            vals[id] = fx(full.Z[i][0], 2);
            marks[id] = LABELED.indexOf(id) >= 0 ? 'y=' + (Y[id] + 1) : '';
          });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: baseRoles('mask'),
            values: vals, marks: marks,
            rings: [{ members: LABELED, pad: 6, perNode: true, label: 'Yₗ' }]
          });
          zGrid(root, api, full, 300);
          api.drawGrid(root, {
            x: 394, y: 46, cw: 44, ch: 24,
            text: g.nodes.map(function (id, i) {
              return LABELED.indexOf(id) >= 0
                ? [(-Math.log(full.Z[i][Y[id]])).toFixed(3)] : ['—'];
            }),
            rowRoles: g.nodes.map(function (id) {
              return LABELED.indexOf(id) >= 0 ? 'labeled' : 'idle';
            }),
            colLabels: ['손실'], heading: ''
          });
          note(root, api, 'ℒ = ' + lossOf(full).toFixed(3) +
            '  (라벨 2개 / 정점 4개)', 240, 186);
        }
      },
      {
        span: 'full', vb: SVB,
        title: 'gradient는 Â가 만든 경로를 거슬러 하나의 W로 모인다',
        desc: '라벨 있는 v1, v4에서 출발한 gradient가 라벨 없는 v2, v3을 지나 층당 하나뿐인 ' +
              'W로 모인다. Â가 대칭이므로 gradient는 forward 메시지와 같은 간선 위를 ' +
              '거슬러 간다 — 새 원시형은 없고 화살의 방향만 늘어난다.',
        caption: '③ backward — 라벨 없는 정점은 손실에 없지만 gradient 경로 위에 있다. ' +
                 '화살은 forward와 같은 간선 위를 거슬러 간다.',
        draw: function (root, api) {
          heading(root, api, '③ backward — 같은 간선, 거슬러 가는 화살', 10, 16);
          var gg = placed(root, api, 8, 22);
          // 이 프레임의 내용은 화살 그 자체다. dim으로 흐리면 대비가 무너져
          // (연한 회색 1.4px) 프레임이 사실상 비어 보인다. 전부 실선으로 둔다.
          var arrows = [];
          g.edges.forEach(function (e) {
            arrows.push({ from: e[0], to: e[1], offset: 5 });
            arrows.push({ from: e[1], to: e[0], offset: 5 });
          });
          var vals = {};
          g.nodes.forEach(function (id) {
            vals[id] = LABELED.indexOf(id) >= 0 ? '∂ℒ' : '·';
          });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: baseRoles('mask'),
            values: vals, arrows: arrows
          });
          // 왼→오 = 층. 1층 W⁽⁰⁾가 왼쪽, 2층 W⁽¹⁾가 오른쪽이어야 축 규약이 깨지지 않는다.
          api.drawBlock(root, {
            x: 300, y: 62, w: 52, h: 60, label: 'W⁽⁰⁾', sub: '공유'
          });
          api.drawBlock(root, {
            x: 364, y: 62, w: 26, h: 60, label: 'W⁽¹⁾'
          });
          note(root, api,
            '층이 둘이어도 W는 층당 하나다. 네 정점이 모두 같은 두 기둥을 통과하고,',
            14, 178);
          note(root, api,
            '파라미터 수는 정점 수 N과 무관하다.', 14, 192);
        }
      },
      {
        span: 'full', vb: SVB,
        title: '라벨 없는 정점을 forward에서 빼면 라벨 정점의 예측이 바뀐다',
        desc: 'v3은 라벨이 없지만 forward에서 제거하면 v1의 Z가 ' +
              full.Z[0][0].toFixed(3) + '에서 ' + cut.Z[cut.idx[1]][0].toFixed(3) +
              '로, v4가 ' + full.Z[3][0].toFixed(3) + '에서 ' +
              cut.Z[cut.idx[4]][0].toFixed(3) + '로 바뀐다. 손실도 ' +
              lossOf(full).toFixed(3) + '에서 ' + lossOf(cut).toFixed(3) + '로 바뀐다.',
        caption: '④ 대조 — 라벨 없는 v₃을 빼면 라벨 있는 v₁, v₄의 숫자가 달라진다. ' +
                 'transductive의 작동적 귀결이다.',
        draw: function (root, api) {
          heading(root, api, '④ v₃을 forward에서 제거한 대조 프레임', 10, 16);
          var gg = placed(root, api, 8, 22);
          var vals = {};
          g.nodes.forEach(function (id) {
            var r = cut.idx[id];
            vals[id] = r == null ? '—' : fx(cut.Z[r][0], 2);
          });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: baseRoles('cut'), values: vals,
            edgeState: function (a, b) {
              return (a === 3 || b === 3) ? 'off' : 'on';
            }
          });
          zGrid(root, api, cut, 300);
          note(root, api,
            'v₁: ' + full.Z[0][0].toFixed(3) + ' → ' +
            cut.Z[cut.idx[1]][0].toFixed(3) + ' · v₄: ' +
            full.Z[3][0].toFixed(3) + ' → ' + cut.Z[cut.idx[4]][0].toFixed(3),
            240, 186);
        }
      }
    ];

    return {
      id: 'semi-mask',
      title: '전 정점 forward ≠ 라벨 손실 마스크',
      badge: 'G4 · 라벨 v₁, v₄ · 2층',
      caption: '논문의 전환은 그래프를 손실의 벌점(식 1)에서 forward의 구조(식 9)로 옮긴 것이다. ' +
               '마스크는 행 선택이지 행 삭제가 아니다 — 격자에서 행을 고를 뿐 지우지 않는다. ' +
               '라벨 없는 정점은 계산 경로로 남는다.',
      falsify: '"라벨 없는 정점은 학습에 쓸모없다"가 맞다면 ④ 프레임에서 v₁, v₄의 ' +
               '숫자가 그대로여야 한다. 둘 다 바뀐다.',
      cols: 1,
      contract: {
        page: '02_kipf2017_gcn_guide.md', slot: 'semi-mask', anchor: 'viz-semi-supervised',
        data: { graphs: ['G4'], ops: ['Ahat', 'idx'] },
        frames: {
          count: 4, preset: 'wide',
          span: ['full', 'full', 'full', 'full'],
          safeArea: SAFE
        },
        primitives: ['S', 'drawBlock', 'drawGraph', 'drawGrid'],
        // ①의 제목은 forward 식 한 줄(46자)이다. 식을 자르면 그림의 주제가
        // 사라지므로 이 그림의 heading 천장만 50으로 올린다.
        text: { maxChars: { heading: 50, note: 60, caption: 300 } },
        fallback: {
          declaresFrameCount: true,
          numbers: ['v1, v4', 'v2, v3', '2층'],
          mustMention: ['지워지지 않고', 'gradient', 'transductive'],
          mustNotMention: []
        }
      },
      frames: function () { return frames; }
    };
  }

  /* ══ 등록 ══════════════════════════════════════════════════ */

  NI3.figures = {
    'state-transition': figStateTransition,
    'aggregate-collide': figAggregate,
    'lineage-strip': figLineage,
    'norm-3up': figNorm,
    'depth-frames': figDepth,
    'oversmoothing': figConverge,
    'semi-mask': figSemi,
    // 05 스펙트럼 다리 — 걸음 순서대로. 02의 'spectral' 한 장이 아홉 장으로 갈라졌다.
    'spec-recap': figSpecRecap,
    'spec-eigen': figSpecEigen,
    'spec-lambda': figSpecLambda,
    'spec-basis': figSpecBasis,
    'spec-filter': figSpecFilter,
    'spec-hop': figSpecHop,
    'spec-cheby': figSpecCheby,
    'spec-explode': figSpecExplode,
    'spec-swap': figSpecSwap,
    'spec-mu': figSpecMu
  };
})(typeof window !== 'undefined' ? window : this);
