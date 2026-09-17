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

  function num(v, d) { return fx(v, d).replace('-', MINUS); }

  /** 원반 안에 들어갈 짧은 3자리 표기 (.056 / .347). */
  function dot3(v) {
    var s = v.toFixed(3);
    if (s.indexOf('0.') === 0) return s.slice(1);
    if (s.indexOf('-0.') === 0) return MINUS + s.slice(2);
    return s.replace('-', MINUS);
  }

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
            'class': 'gnn-flow__line', x1: 214, y1: cy, x2: 222, y2: cy, 'marker-end': api.arrow
          }, root);
          api.drawGrid(root, {
            x: 224, y: cy - 11, cw: 34, ch: 22,
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
      api.drawFeatureAxisFlow(root, box, {
        arrow: api.arrow, gap: 36, label: '특성 축 — W'
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
            'Â₁₃ = ' + fx(o.Ahat[0][2], 3) +
            ' 와 Â₂₄ = ' + fx(o.Ahat[1][3], 3) +
            ' — 받는 쪽 차수는 둘 다 2인데 계수가 다르다(송신자 차수 5 대 3).',
            16, 190);
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
          var gg = placed(root, api, 0, 14);
          heading(root, api, 'k = ' + k + ' · (Â' +
            (k === 1 ? '' : '^' + k) + ')₃ⱼ', 12, 11);
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow,
            roles: roles, values: vals, marks: marks,
            rings: [{ members: inside, pad: 9, label: 'k ≤ ' + k }],
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
   * F6. 스펙트럼 — 02 §4 (#spectral)
   * ════════════════════════════════════════════════════════ */

  function figSpectral() {
    var g = G.G4, o = gr.ops(g);
    var x = g.nodes.map(function (id) { return g.x[id]; });
    var eigL = la.jacobiEig(o.L);
    var eigI = la.jacobiEig(o.Iplus);
    var eigA = la.jacobiEig(o.Ahat);

    function signChanges(vec) {
      var n = 0;
      g.edges.forEach(function (e) {
        var a = vec[o.idx[e[0]]], b = vec[o.idx[e[1]]];
        if (a * b < 0) n++;
      });
      return n;
    }

    var frames = [];

    frames.push({
      span: 'full',
      vb: [0, 0, 424, 176],
      title: '출발점은 정점 위의 숫자 한 벌이다',
      desc: '그래프 신호 x = (1, 2, 3, 4). 원반 안의 숫자와 격자의 한 열은 같은 값이다. ' +
            '고유벡터도 결국 이것의 한 종류다.',
      caption: '그래프 신호 — 계보 전체가 쓰는 바로 그 칸이다. ' +
               '아래 네 프레임은 이 자리에 특별한 신호를 넣은 것뿐이다.',
      draw: function (root, api) {
        var gg = placed(root, api, 0, 12);
        var vals = {}, roles = {};
        g.nodes.forEach(function (id) { vals[id] = String(g.x[id]); roles[id] = 'active'; });
        api.drawGraph(gg, { graph: g, arrow: api.arrow, roles: roles, values: vals });
        api.drawGrid(root, {
          x: 300, y: 46, cw: 52, ch: 24,
          nums: colMat(x), text: colMat(x).map(function (r) { return [String(r[0])]; }),
          rowLabels: rowLabelsOf(g), heading: 'x'
        });
        note(root, api, '채널이 하나인 격자', 300, 152);
      }
    });

    eigL.values.forEach(function (lam, k) {
      var vec = eigL.vectors[k];
      var sc = signChanges(vec);
      frames.push({
        vb: [0, 0, 330, 176],
        title: 'L의 고유벡터 u' + (k + 1) + ', λ = ' + lam.toFixed(2),
        desc: '고유값 ' + lam.toFixed(2) + '의 고유벡터는 정점 위 패턴 ' +
              g.nodes.map(function (id, i) {
                return 'v' + id + ' ' + vec[i].toFixed(2);
              }).join(', ') + ' 이고 간선을 따라 부호가 ' + sc + '번 바뀐다.',
        caption: 'λ = ' + lam.toFixed(2) + ' · 부호 변화 ' + sc +
                 '회 — ' + (sc === 0 ? '가장 평평한 모드' :
                 (sc === g.edges.length ? '가장 진동하는 모드' : '중간 모드')),
        draw: function (root, api) {
          var gg = placed(root, api, 0, 12);
          var vals = {}, marks = {}, roles = {};
          g.nodes.forEach(function (id, i) {
            vals[id] = num(vec[i], 2);
            marks[id] = vec[i] >= 0 ? '+' : '−';
            roles[id] = 'active';
          });
          api.drawGraph(gg, {
            graph: g, arrow: api.arrow, roles: roles, values: vals, marks: marks,
            edgeState: function (a, b) {
              return vec[o.idx[a]] * vec[o.idx[b]] < 0 ? 'off' : 'on';
            }
          });
          api.drawGrid(root, {
            x: 262, y: 44, cw: 48, ch: 24,
            nums: colMat(vec), text: colMat(vec).map(function (r) {
              return [num(r[0], 2)];
            }),
            rowLabels: rowLabelsOf(g),
            heading: 'u' + (k + 1), negPattern: api.negPattern
          });
          note(root, api, '점선 간선 = 부호가 바뀌는 자리', 14, 166);
        }
      });
    });

    // 프레임 경계마다 붙는 선택 배지 네 개. 화면에도, desc에도 같은 문장이 간다.
    var CHOICES = [
      ['(a) K = 1', '선택 — 층당 1-hop으로 묶고 층을 쌓는다'],
      ['(b) θ₀′ = −θ₁′', '선택 — 파라미터를 줄이는 모델링 결정'],
      ['(c) λ_max ≈ 2', '근사 — G4에서는 정확히 2, 일반 그래프에서는 근사'],
      ['(d) I + D⁻¹ᐟ²AD⁻¹ᐟ² → Â', '연산자 교체 — 동치 변형이 아니다']
    ];

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 212],
      title: '세 연산자의 고유값을 한 축에 겹쳐 본다',
      desc: 'L의 고유값은 ' + eigL.values.map(function (v) { return v.toFixed(2); }).join(', ') +
            ', I + D^-1/2 A D^-1/2 의 고유값은 ' +
            eigI.values.map(function (v) { return v.toFixed(2); }).join(', ') +
            ' 로 모두 [0, 2] 안에 있고, Â의 고유값은 ' +
            eigA.values.map(function (v) { return v.toFixed(3); }).join(', ') +
            ' 로 (−1, 1] 안으로 죄어진다. 유도의 네 선택 지점은 ' +
            CHOICES.map(function (p) { return p[0] + ' ' + p[1]; }).join('; ') + '.',
      caption: 'λ는 정점 축 객체가 아니므로 원반 위에도 격자 안에도 그리지 않는다. ' +
               'renormalization은 눈금이 안쪽으로 죄어지는 한 장면이고, ' +
               '유도 네 단계 중 (d)만 동치 변형이 아니다. ' +
               'G4는 이분 그래프라 위 두 눈금이 같은 자리에 찍히지만 ' +
               '대응하는 고유벡터는 서로 다르다.',
      draw: function (root, api) {
        api.drawAxis(root, {
          x: 132, y: 34, w: 300, min: -1.15, max: 2.15, rowH: 26,
          rows: [
            {
              label: 'L',
              marks: eigL.values.map(function (v) {
                return { v: v, label: v.toFixed(2) };
              })
            },
            {
              label: 'I + D⁻¹ᐟ²AD⁻¹ᐟ²',
              marks: eigI.values.map(function (v) {
                return { v: v, label: v.toFixed(2), shape: 'square' };
              })
            },
            {
              label: 'Â = D̃⁻¹ᐟ²ÃD̃⁻¹ᐟ²',
              marks: eigA.values.map(function (v) {
                return { v: v, label: v.toFixed(2), shape: 'tri' };
              })
            }
          ],
          ticks: [-1, 0, 1, 2].map(function (v) {
            return { v: v, label: String(v) };
          }),
          // SVG 글자는 줄바꿈이 없다. 긴 문장은 프레임 캡션(HTML)이 맡는다.
          caption: '위 두 눈금은 같은 자리 — 고유벡터는 다르다'
        });
        CHOICES.forEach(function (p, i) {
          api.S('text', {
            'class': 'gnn-badge__k' + (i === 3 ? ' gnn-badge__k--warn' : ''),
            x: 18, y: 162 + i * 13, text: p[0] + '  ' + p[1]
          }, root);
        });
      }
    });

    frames.push({
      span: 'full',
      vb: [0, 0, 452, 150],
      title: '반복하면 어느 모드가 먼저 죽는가',
      desc: 'Â를 k번 적용하면 각 모드의 진폭은 |μ|^k로 줄어든다. ' +
            eigA.values.map(function (v) {
              return 'μ=' + v.toFixed(3) + '는 k=8에서 ' +
                     Math.pow(Math.abs(v), 8).toFixed(4);
            }).join(', ') + '. 고유값 1인 모드만 살아남는다.',
      caption: '살아남는 모드가 √d̃ 다. 이것이 오버스무딩의 메커니즘이고, ' +
               '(d)가 왜 동치가 아닌지의 근거이기도 하다.',
      draw: function (root, api) {
        heading(root, api, 'Â를 k번 반복한 뒤 남는 진폭 |μ|ᵏ', 18, 20);
        var order = eigA.values.slice().sort(function (a, b) {
          return Math.abs(b) - Math.abs(a);
        });
        api.drawAxis(root, {
          x: 92, y: 40, w: 330, min: 0, max: 1.06, rowH: 22,
          rows: order.map(function (mu) {
            if (Math.abs(mu) > 0.99) {
              return {
                label: 'μ = ' + mu.toFixed(3),
                marks: [{ v: 1, label: '모든 k' }]
              };
            }
            return {
              label: 'μ = ' + mu.toFixed(3),
              marks: [1, 2, 4, 8].map(function (k) {
                // 8개 눈금이 0 근처에 뭉치므로 양 끝만 라벨을 단다.
                return {
                  v: Math.pow(Math.abs(mu), k),
                  label: (k === 1 || k === 8) ? 'k=' + k : null
                };
              })
            };
          }),
          ticks: [0, 0.25, 0.5, 0.75, 1].map(function (v) {
            return { v: v, label: v.toFixed(2) };
          }),
          caption: '최대 |μ|가 2였다면 k = 8에서 256배가 되는 모드가 생긴다.'
        });
      }
    });

    return {
      id: 'spectral',
      title: '스펙트럼 — 고유벡터는 정점 위 패턴, 고유값은 별도 축',
      badge: 'G4 · L = I − D⁻¹ᐟ²AD⁻¹ᐟ²',
      caption: '행을 주파수 순으로 재정렬하지 않는다. 격자의 행 순서는 정점 순서이고 ' +
               '영구히 고정이다. 고유벡터 uₖ는 정점 축 객체이므로 원반과 격자 한 열로, ' +
               '고유값 λₖ는 정점 축 객체가 아니므로 오직 S 축 위에만 그린다.',
      falsify: '"GCN은 스펙트럼 합성곱과 동치"가 맞다면 마지막에서 두 번째 프레임의 ' +
               '세 눈금이 같은 자리에 찍혀야 한다. 세 번째 줄만 안쪽으로 죄어져 있다.',
      cols: 2,
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
    'spectral': figSpectral,
    'semi-mask': figSemi
  };
})(typeof window !== 'undefined' ? window : this);
