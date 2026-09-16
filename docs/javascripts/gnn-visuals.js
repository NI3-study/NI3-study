/*!
 * gnn-visuals.js — NI3 GNN Study
 *
 * 의존성 없는 인라인 SVG 인터랙티브 3종.
 *  1) message-passing : 메시지 → 집계 → 갱신 4단계와 한국어 수식/숫자 동기화
 *  2) normalization   : 차수가 불균형한 그래프에서 A+I 원본 가중치 vs 대칭 정규화 가중치
 *  3) receptive-field : 0~3 hop 수용 영역 슬라이더
 *
 * 설계 원칙
 *  - 타이머·애니메이션 루프를 쓰지 않는다. 모든 상태 변화는 사용자 조작에만 반응한다.
 *  - 색만으로 정보를 전달하지 않는다. 숫자, 기호(✓ / –), 선 굵기, 점선/실선을 함께 쓴다.
 *  - 색상은 CSS 변수로만 지정해 라이트/다크 테마를 따라간다.
 *  - 조작부는 button / input[type=radio] / input[type=range] 등 기본 요소만 쓴다.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var seq = 0;

  /* ── DOM 헬퍼 ───────────────────────────────────────────── */

  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'text') e.textContent = attrs[k];
        else if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function H(tag, attrs, parent) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'text') e.textContent = attrs[k];
        else if (k === 'class') e.setAttribute('class', attrs[k]);
        else if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /** 숫자를 소수점 d자리로 자르되 불필요한 0은 없앤다. */
  function fmt(v, d) {
    var s = v.toFixed(d == null ? 4 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  var SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  function sub(n) {
    return String(n).split('').map(function (c) { return SUB[+c]; }).join('');
  }

  /**
   * 수식 한 줄을 만든다. parts 는 문자열(일반 텍스트) 또는 {n: '5'}(강조할 숫자).
   * 숫자는 색 대신 굵기 + 밑줄 + 테두리로 구분하므로 색을 못 봐도 읽힌다.
   */
  function eqRow(parent, parts) {
    var row = H('p', { 'class': 'gnn-eq__row' }, parent);
    parts.forEach(function (p) {
      if (typeof p === 'string') {
        H('span', { 'class': 'gnn-eq__t', text: p }, row);
      } else {
        H('span', { 'class': 'gnn-num', text: p.n }, row);
      }
    });
    return row;
  }

  function rowText(parts) {
    return parts.map(function (p) { return typeof p === 'string' ? p : p.n; }).join('');
  }

  /* ── 공통 셸 ────────────────────────────────────────────── */

  function shell(root, opt) {
    root.setAttribute('class', 'gnn-viz');
    clear(root);
    var id = 'gnnv' + (++seq);

    var head = H('div', { 'class': 'gnn-viz__head' }, root);
    H('h4', { 'class': 'gnn-viz__title', id: id + '-t', text: opt.title }, head);
    H('p', { 'class': 'gnn-viz__desc', text: opt.desc }, head);

    var controls = H('div', { 'class': 'gnn-viz__controls' }, root);
    var stage = H('div', { 'class': 'gnn-viz__stage' }, root);

    var svg = S('svg', {
      viewBox: opt.viewBox,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-labelledby': id + '-svgt ' + id + '-svgd'
    }, stage);
    var svgTitle = S('title', { id: id + '-svgt', text: opt.svgTitle }, svg);
    var svgDesc = S('desc', { id: id + '-svgd', text: opt.svgDesc }, svg);

    // 화살촉: currentColor 를 쓰므로 선 색과 함께 테마를 따라간다.
    var defs = S('defs', null, svg);
    var marker = S('marker', {
      id: id + '-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse'
    }, defs);
    S('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' }, marker);

    var readout = H('div', {
      'class': 'gnn-viz__readout',
      role: 'status',
      'aria-live': 'polite'
    }, root);

    return {
      id: id, root: root, controls: controls, svg: svg,
      svgTitle: svgTitle, svgDesc: svgDesc,
      arrow: 'url(#' + id + '-arrow)', readout: readout
    };
  }

  /** 라디오 그룹(fieldset/legend) 생성. */
  function radioGroup(parent, legendText, name, items, initial, onChange) {
    var fs = H('fieldset', { 'class': 'gnn-fieldset' }, parent);
    H('legend', { 'class': 'gnn-legend', text: legendText }, fs);
    var wrap = H('div', { 'class': 'gnn-radios' }, fs);
    items.forEach(function (it, idx) {
      var rid = name + '-' + idx;
      var lab = H('label', { 'class': 'gnn-radio', 'for': rid }, wrap);
      var input = H('input', {
        type: 'radio', name: name, id: rid, value: String(it.value)
      }, lab);
      if (it.value === initial) input.checked = true;
      H('span', { text: it.label }, lab);
      input.addEventListener('change', function () {
        if (input.checked) onChange(it.value);
      });
    });
    return fs;
  }

  /* ── 그래프 유틸 ────────────────────────────────────────── */

  function neighbors(edges, i) {
    var out = [];
    edges.forEach(function (e) {
      if (e[0] === i) out.push(e[1]);
      else if (e[1] === i) out.push(e[0]);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  /** 시작점에서의 hop 거리(BFS). 도달 불가는 Infinity. */
  function hopDistance(nodeIds, edges, start) {
    var dist = {};
    nodeIds.forEach(function (n) { dist[n] = Infinity; });
    dist[start] = 0;
    var queue = [start];
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      neighbors(edges, cur).forEach(function (nb) {
        if (dist[nb] === Infinity) {
          dist[nb] = dist[cur] + 1;
          queue.push(nb);
        }
      });
    }
    return dist;
  }

  /** 두 원 중심을 잇는 선분을 반지름만큼 잘라낸 좌표. */
  function trim(a, b, ra, rb) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    return {
      x1: a.x + ux * ra, y1: a.y + uy * ra,
      x2: b.x - ux * rb, y2: b.y - uy * rb,
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
      px: -uy, py: ux
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 1) 메시지 패싱 4단계
   * ════════════════════════════════════════════════════════ */

  var MP_POS = {
    1: { x: 150, y: 70 }, 2: { x: 290, y: 70 },
    3: { x: 60, y: 180 }, 4: { x: 370, y: 180 }
  };
  var MP_EDGES = [[1, 2], [1, 3], [2, 4]];
  var MP_X = { 1: 1, 2: 2, 3: 3, 4: 4 };
  var MP_R = 26;

  var MP_STEPS = [
    { tag: '①', name: '초기 상태', hint: '각 정점은 자기 특성만 들고 있다.' },
    { tag: '②', name: '메시지 생성', hint: '이웃 j가 자기 상태를 그대로 메시지로 보낸다.' },
    { tag: '③', name: '집계', hint: '순서에 무관한 합으로 모은다. 이웃 순서를 바꿔도 값은 같다.' },
    { tag: '④', name: '갱신', hint: '자기 상태와 모인 이웃 정보를 결합한다.' }
  ];

  function messagePassing(root) {
    var ui = shell(root, {
      title: '메시지 패싱 한 층을 4단계로 보기',
      desc: '중심 정점을 고르고 단계를 넘기면 그림과 한국어 수식의 숫자가 함께 바뀐다. ' +
            '정점 특성은 x = (1, 2, 3, 4), 간선은 (1,2), (1,3), (2,4)이다.',
      viewBox: '0 0 420 250',
      svgTitle: '메시지 패싱 단계별 그래프',
      svgDesc: '정점 4개와 간선 3개로 이루어진 그래프. 현재 단계에 따라 중심 정점, ' +
               '이웃에서 오는 메시지 화살표, 갱신된 값이 표시된다.'
    });

    var state = { focus: 1, step: 0 };

    // ── 조작부
    radioGroup(ui.controls, '중심 정점', ui.id + '-focus',
      [1, 2, 3, 4].map(function (n) { return { value: n, label: '정점 ' + n }; }),
      1, function (v) { state.focus = v; state.step = 0; render(); });

    var stepBox = H('fieldset', { 'class': 'gnn-fieldset' }, ui.controls);
    H('legend', { 'class': 'gnn-legend', text: '단계' }, stepBox);
    var stepBar = H('div', { 'class': 'gnn-btnbar' }, stepBox);

    var prevBtn = H('button', { type: 'button', 'class': 'gnn-btn', text: '← 이전' }, stepBar);
    var stepBtns = MP_STEPS.map(function (st, i) {
      var b = H('button', {
        type: 'button', 'class': 'gnn-btn gnn-btn--step',
        text: st.tag + ' ' + st.name
      }, stepBar);
      b.addEventListener('click', function () { state.step = i; render(); });
      return b;
    });
    var nextBtn = H('button', { type: 'button', 'class': 'gnn-btn', text: '다음 →' }, stepBar);

    prevBtn.addEventListener('click', function () {
      state.step = Math.max(0, state.step - 1); render();
    });
    nextBtn.addEventListener('click', function () {
      state.step = Math.min(MP_STEPS.length - 1, state.step + 1); render();
    });

    // ── 출력부
    var eq = H('div', { 'class': 'gnn-eq' }, ui.readout);

    var plot = S('g', null, ui.svg);

    function render() {
      var i = state.focus;
      var step = state.step;
      var nbrs = neighbors(MP_EDGES, i);
      var agg = nbrs.reduce(function (s, j) { return s + MP_X[j]; }, 0);
      var updated = MP_X[i] + agg;

      prevBtn.disabled = step === 0;
      nextBtn.disabled = step === MP_STEPS.length - 1;
      stepBtns.forEach(function (b, k) {
        b.setAttribute('aria-pressed', k === step ? 'true' : 'false');
      });

      // ── 그림
      clear(plot);

      MP_EDGES.forEach(function (e) {
        var on = (e[0] === i || e[1] === i) && step >= 1;
        var t = trim(MP_POS[e[0]], MP_POS[e[1]], 0, 0);
        S('line', {
          'class': 'gnn-edge ' + (on ? 'gnn-edge--on' : 'gnn-edge--off'),
          x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2
        }, plot);
      });

      // 메시지 화살표 (② 이후)
      if (step >= 1) {
        nbrs.forEach(function (j) {
          var t = trim(MP_POS[j], MP_POS[i], MP_R + 4, MP_R + 10);
          S('line', {
            'class': 'gnn-arrow',
            x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2,
            'marker-end': ui.arrow
          }, plot);
          var lx = t.mx + t.px * 16;
          var ly = t.my + t.py * 16;
          var g = S('g', { 'class': 'gnn-msgtag' }, plot);
          S('rect', { x: lx - 30, y: ly - 13, width: 60, height: 22, rx: 6 }, g);
          S('text', {
            x: lx, y: ly + 3, 'text-anchor': 'middle',
            text: 'm' + sub(j) + '→' + sub(i) + '=' + MP_X[j]
          }, g);
        });
      }

      [1, 2, 3, 4].forEach(function (n) {
        var p = MP_POS[n];
        var role = 'idle';
        if (n === i) role = 'focus';
        else if (step >= 1 && nbrs.indexOf(n) >= 0) role = 'active';

        var g = S('g', { 'class': 'gnn-node gnn-node--' + role }, plot);
        S('circle', { cx: p.x, cy: p.y, r: MP_R }, g);
        var val = (n === i && step === 3) ? updated : MP_X[n];
        S('text', {
          'class': 'gnn-node__val', x: p.x, y: p.y + 6,
          'text-anchor': 'middle', text: String(val)
        }, g);
        S('text', {
          'class': 'gnn-node__name', x: p.x, y: p.y + MP_R + 18,
          'text-anchor': 'middle',
          text: 'v' + n + (n === i ? ' (중심)' : '')
        }, g);
      });

      // 집계 배지 (③ 이후)
      if (step >= 2) {
        var p = MP_POS[i];
        var g2 = S('g', { 'class': 'gnn-badge' }, plot);
        var label = step === 2
          ? 'm̄' + sub(i) + ' = ' + agg
          : 'h' + sub(i) + "' = " + updated;
        S('rect', { x: p.x - 46, y: p.y - MP_R - 30, width: 92, height: 24, rx: 7 }, g2);
        S('text', {
          x: p.x, y: p.y - MP_R - 13, 'text-anchor': 'middle', text: label
        }, g2);
      }

      // ── 수식
      var st = MP_STEPS[step];
      clear(eq);
      H('p', {
        'class': 'gnn-eq__step',
        text: st.tag + ' ' + st.name + ' — ' + st.hint
      }, eq);

      var lines = [];
      if (step === 0) {
        lines.push(['h', sub(i), '⁽⁰⁾ = x', sub(i), ' = ', { n: String(MP_X[i]) }]);
        lines.push(['이웃 N(', String(i), ') = {', nbrs.join(', '), '}']);
      } else if (step === 1) {
        lines.push(['m', 'ⱼ→', sub(i), ' = h', 'ⱼ', ' (가장 단순한 메시지 함수)']);
        nbrs.forEach(function (j) {
          lines.push(['m', sub(j), '→', sub(i), ' = h', sub(j), ' = ', { n: String(MP_X[j]) }]);
        });
      } else if (step === 2) {
        lines.push(['m̄', sub(i), ' = Σ m', 'ⱼ→', sub(i), ' = ',
          { n: nbrs.map(function (j) { return String(MP_X[j]); }).join(' + ') || '0' },
          ' = ', { n: String(agg) }]);
        lines.push(['합은 순서에 무관하다: ',
          { n: nbrs.map(function (j) { return String(MP_X[j]); }).reverse().join(' + ') || '0' },
          ' = ', { n: String(agg) }]);
      } else {
        lines.push(['h', sub(i), "' = h", sub(i), ' + m̄', sub(i), ' = ',
          { n: String(MP_X[i]) }, ' + ', { n: String(agg) }, ' = ', { n: String(updated) }]);
        lines.push(['이 값은 (A + I)X 의 ', String(i), '행과 같다.']);
      }
      lines.forEach(function (parts) { eqRow(eq, parts); });

      // ── 접근성 텍스트
      var summary = '단계 ' + (step + 1) + '/4, ' + st.name + '. 중심 정점 v' + i +
        ', 이웃 ' + (nbrs.length ? nbrs.map(function (j) { return 'v' + j; }).join(', ') : '없음') +
        '. ' + lines.map(rowText).join(' / ');
      ui.svgDesc.textContent = summary;
      var sr = ui.readout.querySelector('.gnn-sr');
      if (!sr) sr = H('p', { 'class': 'gnn-sr' }, ui.readout);
      sr.textContent = summary;
    }

    render();
  }

  /* ══════════════════════════════════════════════════════════
   * 2) A+I 원본 가중치 vs 대칭 정규화 가중치
   * ════════════════════════════════════════════════════════ */

  var NM_NODES = [1, 2, 3, 4, 5, 6];
  var NM_EDGES = [[1, 2], [1, 3], [1, 4], [1, 5], [5, 6]];
  var NM_POS = {
    1: { x: 185, y: 150 }, 2: { x: 60, y: 60 }, 3: { x: 60, y: 245 },
    4: { x: 185, y: 272 }, 5: { x: 320, y: 128 }, 6: { x: 435, y: 55 }
  };
  var NM_R = 24;

  function normalization(root) {
    var ui = shell(root, {
      title: '원본 A + I 와 대칭 정규화 Â 의 숫자 비교',
      desc: '허브 정점 v1의 차수가 4, 잎 정점들의 차수가 1인 불균형 그래프다. ' +
            '차수 효과만 보기 위해 모든 정점 특성을 xᵢ = 1 로 두었다. ' +
            '보기를 바꾸면 간선 가중치와 각 정점의 출력값이 함께 바뀐다.',
      viewBox: '0 0 480 310',
      svgTitle: '차수가 불균형한 6정점 그래프의 간선 가중치',
      svgDesc: '정점 6개, 간선 5개. 각 간선에 현재 보기의 수치 가중치가 적혀 있고 선 굵기도 가중치에 비례한다.'
    });

    // 차수(자기 연결 포함)
    var deg = {};
    NM_NODES.forEach(function (n) { deg[n] = neighbors(NM_EDGES, n).length + 1; });

    var state = { mode: 'raw' };

    radioGroup(ui.controls, '집계 가중치 보기', ui.id + '-mode', [
      { value: 'raw', label: '원본 A + I (모든 가중치 1)' },
      { value: 'sym', label: '대칭 정규화 Â = D̃^(-1/2)(A+I)D̃^(-1/2)' }
    ], 'raw', function (v) { state.mode = v; render(); });

    var plot = S('g', null, ui.svg);
    var panel = H('div', { 'class': 'gnn-panel' }, ui.readout);

    function weight(a, b) {
      if (state.mode === 'raw') return 1;
      return 1 / Math.sqrt(deg[a] * deg[b]);
    }

    function render() {
      var sym = state.mode === 'sym';

      // 각 정점의 출력값 = 자기 가중치 + 이웃 가중치 합 (특성이 모두 1이므로)
      var out = {};
      NM_NODES.forEach(function (n) {
        var s = weight(n, n);
        neighbors(NM_EDGES, n).forEach(function (j) { s += weight(n, j); });
        out[n] = s;
      });

      var vals = NM_NODES.map(function (n) { return out[n]; });
      var maxV = Math.max.apply(null, vals);
      var minV = Math.min.apply(null, vals);
      var ratio = maxV / minV;

      clear(plot);

      NM_EDGES.forEach(function (e) {
        var w = weight(e[0], e[1]);
        var t = trim(NM_POS[e[0]], NM_POS[e[1]], 0, 0);
        S('line', {
          'class': 'gnn-edge gnn-edge--w',
          x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2,
          'stroke-width': (1.5 + w * 6).toFixed(2)
        }, plot);

        var lx = t.mx + t.px * 15;
        var ly = t.my + t.py * 15;
        var g = S('g', { 'class': 'gnn-wtag' }, plot);
        S('rect', { x: lx - 30, y: ly - 12, width: 60, height: 21, rx: 6 }, g);
        S('text', {
          x: lx, y: ly + 3, 'text-anchor': 'middle',
          text: sym ? fmt(w, 4) : '1'
        }, g);
      });

      NM_NODES.forEach(function (n) {
        var p = NM_POS[n];
        var role = out[n] === maxV ? 'focus' : (out[n] === minV ? 'active' : 'idle');
        var g = S('g', { 'class': 'gnn-node gnn-node--' + role }, plot);
        S('circle', { cx: p.x, cy: p.y, r: NM_R }, g);
        S('text', {
          'class': 'gnn-node__val', x: p.x, y: p.y + 5,
          'text-anchor': 'middle', text: fmt(out[n], sym ? 2 : 0)
        }, g);
        S('text', {
          'class': 'gnn-node__name', x: p.x, y: p.y + NM_R + 17,
          'text-anchor': 'middle', text: 'v' + n + ' · d̃=' + deg[n]
        }, g);
      });

      // ── 표
      clear(panel);
      H('p', {
        'class': 'gnn-eq__step',
        text: sym
          ? '대칭 정규화 — 간선 (i, j)의 계수는 1 / √(d̃ᵢ · d̃ⱼ) 이다. 보내는 쪽과 받는 쪽 차수를 모두 반영한다.'
          : '원본 A + I — 모든 간선과 자기 연결의 계수가 1이다. 출력값이 곧 차수 d̃ᵢ 가 된다.'
      }, panel);

      var table = H('table', { 'class': 'gnn-table' }, panel);
      var thead = H('thead', null, table);
      var hr = H('tr', null, thead);
      ['정점', '차수 d̃ᵢ', '자기 가중치 Âᵢᵢ', '이웃 가중치', '출력값'].forEach(function (h) {
        H('th', { scope: 'col', text: h }, hr);
      });
      var tbody = H('tbody', null, table);
      NM_NODES.forEach(function (n) {
        var tr = H('tr', null, tbody);
        H('th', { scope: 'row', text: 'v' + n }, tr);
        H('td', { text: String(deg[n]) }, tr);
        H('td', { text: sym ? fmt(weight(n, n), 4) : '1' }, tr);
        H('td', {
          text: neighbors(NM_EDGES, n).map(function (j) {
            return sym ? fmt(weight(n, j), 4) : '1';
          }).join(', ')
        }, tr);
        H('td', { text: fmt(out[n], sym ? 4 : 0) }, tr);
      });

      var note = '최댓값 ' + fmt(maxV, 4) + ' ÷ 최솟값 ' + fmt(minV, 4) +
        ' = ' + fmt(ratio, 3) + '배';
      H('p', { 'class': 'gnn-note', text: '차수 격차: ' + note }, panel);

      var summary = (sym ? '대칭 정규화 Â' : '원본 A + I') + ' 보기. ' +
        NM_NODES.map(function (n) {
          return 'v' + n + '(차수 ' + deg[n] + ') 출력 ' + fmt(out[n], 4);
        }).join(', ') + '. ' + note + '.';
      ui.svgDesc.textContent = summary;
      var sr = ui.readout.querySelector('.gnn-sr');
      if (!sr) sr = H('p', { 'class': 'gnn-sr' }, ui.readout);
      sr.textContent = summary;
    }

    render();
  }

  /* ══════════════════════════════════════════════════════════
   * 3) 0~3 hop 수용 영역 슬라이더
   * ════════════════════════════════════════════════════════ */

  var RF_NODES = [1, 2, 3, 4, 5, 6, 7, 8];
  var RF_EDGES = [[1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8]];
  var RF_POS = {
    1: { x: 55, y: 105 },
    2: { x: 170, y: 55 }, 3: { x: 170, y: 155 },
    4: { x: 285, y: 55 }, 5: { x: 285, y: 155 },
    6: { x: 400, y: 55 }, 7: { x: 400, y: 155 },
    8: { x: 515, y: 55 }
  };
  var RF_R = 22;

  function receptiveField(root) {
    var ui = shell(root, {
      title: '층을 쌓으면 수용 영역이 얼마나 넓어지는가',
      desc: '중심 정점 v1 기준으로 층 수 k를 0에서 3까지 옮겨 본다. ' +
            'k층 메시지 패싱의 수용 영역은 최대 k-hop 부분 그래프다. ' +
            '각 정점 안의 숫자는 v1으로부터의 hop 거리이고, ✓는 포함, –는 아직 닿지 않음을 뜻한다.',
      viewBox: '0 0 580 215',
      svgTitle: 'v1의 k-hop 수용 영역',
      svgDesc: '정점 8개가 hop 거리에 따라 왼쪽에서 오른쪽으로 배치되어 있다.'
    });

    var dist = hopDistance(RF_NODES, RF_EDGES, 1);
    var state = { k: 0 };

    var fs = H('fieldset', { 'class': 'gnn-fieldset' }, ui.controls);
    H('legend', { 'class': 'gnn-legend', text: '메시지 패싱 층 수 k' }, fs);
    var line = H('div', { 'class': 'gnn-slider' }, fs);
    var lab = H('label', { 'for': ui.id + '-k', text: 'k =' }, line);
    var range = H('input', {
      type: 'range', id: ui.id + '-k', min: '0', max: '3', step: '1', value: '0',
      list: ui.id + '-ticks'
    }, line);
    var outEl = H('output', { 'for': ui.id + '-k', 'class': 'gnn-out', text: '0' }, line);
    var dl = H('datalist', { id: ui.id + '-ticks' }, line);
    ['0', '1', '2', '3'].forEach(function (v) {
      H('option', { value: v, label: v + '층' }, dl);
    });
    range.addEventListener('input', function () {
      state.k = parseInt(range.value, 10) || 0;
      render();
    });
    void lab;

    var plot = S('g', null, ui.svg);
    var panel = H('div', { 'class': 'gnn-panel' }, ui.readout);

    function render() {
      var k = state.k;
      outEl.textContent = String(k);

      var inside = RF_NODES.filter(function (n) { return dist[n] <= k; });

      clear(plot);

      RF_EDGES.forEach(function (e) {
        var used = Math.max(dist[e[0]], dist[e[1]]) <= k;
        var t = trim(RF_POS[e[0]], RF_POS[e[1]], 0, 0);
        S('line', {
          'class': 'gnn-edge ' + (used ? 'gnn-edge--on' : 'gnn-edge--off'),
          x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2
        }, plot);
      });

      RF_NODES.forEach(function (n) {
        var p = RF_POS[n];
        var included = dist[n] <= k;
        var role = n === 1 ? 'focus' : (included ? 'active' : 'idle');
        var g = S('g', {
          'class': 'gnn-node gnn-node--' + role + (included ? '' : ' gnn-node--out')
        }, plot);
        S('circle', { cx: p.x, cy: p.y, r: RF_R }, g);
        S('text', {
          'class': 'gnn-node__val', x: p.x, y: p.y + 5,
          'text-anchor': 'middle', text: String(dist[n])
        }, g);
        S('text', {
          'class': 'gnn-node__mark', x: p.x, y: p.y - RF_R - 6,
          'text-anchor': 'middle', text: included ? '✓' : '–'
        }, g);
        S('text', {
          'class': 'gnn-node__name', x: p.x, y: p.y + RF_R + 17,
          'text-anchor': 'middle', text: 'v' + n
        }, g);
      });

      clear(panel);
      H('p', {
        'class': 'gnn-eq__step',
        text: k === 0
          ? 'k = 0 — 아직 메시지 패싱 층이 없다. v1은 자기 특성만 본다.'
          : 'k = ' + k + ' — 1-hop 층을 ' + k + '번 쌓으면 v1의 표현에 최대 ' + k + '-hop 정보가 섞인다.'
      }, panel);

      var list = H('dl', { 'class': 'gnn-dl' }, panel);
      H('dt', { text: '수용 영역 크기' }, list);
      H('dd', { text: inside.length + ' / ' + RF_NODES.length + ' 정점' }, list);
      H('dt', { text: '포함된 정점' }, list);
      H('dd', {
        text: inside.map(function (n) { return 'v' + n + '(' + dist[n] + 'hop)'; }).join(', ')
      }, list);
      H('dt', { text: '아직 닿지 않은 정점' }, list);
      H('dd', {
        text: RF_NODES.filter(function (n) { return dist[n] > k; })
          .map(function (n) { return 'v' + n + '(' + dist[n] + 'hop)'; }).join(', ') || '없음'
      }, list);

      H('p', {
        'class': 'gnn-note',
        text: '주의: "정확히 거리 k" 가 아니라 "거리 k 이하"다. 자기 연결과 더 짧은 경로가 있으면 ' +
              '가까운 정보도 함께 섞인다.'
      }, panel);

      var summary = 'k = ' + k + '. 수용 영역 ' + inside.length + '개 정점: ' +
        inside.map(function (n) { return 'v' + n; }).join(', ') + '.';
      ui.svgDesc.textContent = summary +
        ' 정점 8개가 hop 거리에 따라 왼쪽에서 오른쪽으로 배치되어 있다.';
      var sr = ui.readout.querySelector('.gnn-sr');
      if (!sr) sr = H('p', { 'class': 'gnn-sr' }, ui.readout);
      sr.textContent = summary;
    }

    render();
  }

  /* ── 부팅 ───────────────────────────────────────────────── */

  var BUILDERS = {
    'message-passing': messagePassing,
    'normalization': normalization,
    'receptive-field': receptiveField
  };

  function init() {
    var nodes = document.querySelectorAll('[data-gnn-viz]');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.getAttribute('data-gnn-ready') === '1') return;
      var build = BUILDERS[el.getAttribute('data-gnn-viz')];
      if (!build) return;
      el.setAttribute('data-gnn-ready', '1');
      build(el);
    });
  }

  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(init);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
