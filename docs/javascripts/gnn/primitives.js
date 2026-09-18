/*!
 * gnn/primitives.js — NI3 GNN Study · 시각 계보 L1
 *
 * 재사용 가능한 원시형 렌더러. 그림별 분기는 여기에 없다.
 *
 *   원반(N)  drawGraph  — 정점 정체성 1개
 *   칸(C)    drawGrid   — 스칼라 1개. 특성·가중치·고유벡터 성분·기여도의 공통 단위
 *   현(L)    drawGraph  — 간선 1개. 굵기=계수, 숫자 병기
 *   화살(F)  drawGraph  — 흐름 1건(메시지 또는 gradient). 방향 필수
 *   테(R)    drawGraph  — 집합 경계(이웃·수용 집합·K-국소·Y_L)
 *   기둥(B)  drawBlock  — 학습 파라미터 W. 언제나 격자 오른쪽
 *   축(S)    drawAxis   — 정점 축 위에 살지 않는 양(λ, 층 수, 행 간 거리)
 *
 * 축 규약(예외 없음): 세로 = 정점 축, 가로 = 특성 축, 왼→오 = 층.
 * 색은 정체성이 아니라 역할이며, 색 단독 인코딩은 금지한다.
 */
(function (global) {
  'use strict';

  var NI3 = (global.NI3GNN = global.NI3GNN || {});
  var NS = 'http://www.w3.org/2000/svg';
  var uidSeq = 0;

  /* ══ DOM 헬퍼 ══════════════════════════════════════════════ */

  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag), k;
    if (attrs) {
      for (k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'text') e.textContent = attrs[k];
        else if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function H(tag, attrs, parent) {
    var e = document.createElement(tag), k;
    if (attrs) {
      for (k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'text') e.textContent = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function uid(prefix) {
    return (prefix || 'gnn') + (++uidSeq);
  }

  /* ══ 숫자 표기 ═════════════════════════════════════════════ */

  /** 고정 소수. -0.00 은 0.00 으로 정규화한다. */
  function fx(v, d) {
    var n = (d == null ? 2 : d);
    var s = v.toFixed(n);
    if (/^-0\.?0*$/.test(s)) s = s.slice(1);
    return s;
  }

  /** 불필요한 0을 없앤 짧은 표기. */
  function fs(v, d) {
    var s = fx(v, d == null ? 4 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  var SUB = ['₀', '₁', '₂', '₃', '₄',
             '₅', '₆', '₇', '₈', '₉'];

  function sub(n) {
    return String(n).split('').map(function (c) {
      return SUB[+c] != null ? SUB[+c] : c;
    }).join('');
  }

  /** 두 원 중심을 잇는 선분을 반지름만큼 잘라낸 좌표와 수직 방향. */
  function trim(a, b, ra, rb) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    return {
      x1: a[0] + ux * ra, y1: a[1] + uy * ra,
      x2: b[0] - ux * rb, y2: b[1] - uy * rb,
      mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2,
      px: -uy, py: ux
    };
  }

  /* ══ 원반 표면 — drawGraph ═════════════════════════════════ */

  /**
   * opt = {
   *   graph, radius,
   *   roles:   {id -> 'focus'|'active'|'idle'|'out'|'labeled'},
   *   values:  {id -> string}      원반 안 숫자
   *   names:   {id -> string}      원반 아래 라벨 (기본 v{id})
   *   marks:   {id -> string}      원반 위 기호
   *   edgeLabel: fn(a, b) -> string|null,
   *   edgeWidth: fn(a, b) -> number|null,   (선 굵기 배수 0..1)
   *   edgeState: fn(a, b) -> 'on'|'off'|'w'|'bottleneck',
   *   arrows:  [{from, to, label, dim}],
   *   rings:   [{center, pad, label}],
   *   selfLoops:  {id -> {label, width}}          원반 위에 걸치는 반원
   *   extraEdges: [{a, b, label, width, labelOff}] 배선에 없는 쌍(점찍은 현)
   *   arrow:   marker url
   * }
   */
  function drawGraph(g, opt) {
    var graph = opt.graph;
    var r = opt.radius != null ? opt.radius : (graph.radius || 19);
    var pos = graph.pos;
    var roles = opt.roles || {};
    var layer = S('g', { 'class': 'gnn-surface gnn-surface--disc' }, g);

    // 테(R): 집합 경계.
    //
    // 기본은 구성원 전체를 감싸는 사각 테다. 그런데 사각 테는 구성원이 아닌
    // 정점을 우연히 품을 수 있으므로, 그런 집합에는 perNode 테(정점마다 하나)를
    // 쓴다. 테가 거짓말을 하면 그림 전체가 거짓말이 된다.
    (opt.rings || []).forEach(function (ring) {
      var ids = ring.members || [];
      if (!ids.length) return;
      var pad = (ring.pad == null ? 12 : ring.pad) + r;
      var ge = S('g', { 'class': 'gnn-ring' }, layer);

      function box(list) {
        var xs = list.map(function (id) { return pos[id][0]; });
        var ys = list.map(function (id) { return pos[id][1]; });
        return {
          x0: Math.min.apply(null, xs) - pad, x1: Math.max.apply(null, xs) + pad,
          y0: Math.min.apply(null, ys) - pad, y1: Math.max.apply(null, ys) + pad
        };
      }

      var groups = ring.perNode
        ? ids.map(function (id) { return [id]; })
        : [ids];

      var top = null;
      groups.forEach(function (list) {
        var b = box(list);
        S('rect', {
          x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0,
          rx: Math.min(28, (b.y1 - b.y0) / 2)
        }, ge);
        if (!top || b.y0 < top.y0) top = b;
      });

      if (ring.label && top) {
        // 이 3px를 더 띄우면 테가 큰 프레임에서 이름표가 프레임 제목과 붙는다.
        // 테가 정점 하나만 감쌀 때의 걸음표 겹침은 여기가 아니라 그 그림의 pad로 푼다.
        S('text', {
          'class': 'gnn-ring__label', x: top.x0 + 4, y: top.y0 - 3, text: ring.label
        }, ge);
      }
    });

    // 현(L): 간선
    graph.edges.forEach(function (e) {
      var state = opt.edgeState ? opt.edgeState(e[0], e[1]) : 'on';
      var t = trim(pos[e[0]], pos[e[1]], 0, 0);
      var w = opt.edgeWidth ? opt.edgeWidth(e[0], e[1]) : null;
      var attrs = {
        'class': 'gnn-edge gnn-edge--' + state,
        x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2
      };
      // 프레젠테이션 속성은 author CSS(.gnn-edge { stroke-width: 2 })에 밀린다.
      // 속성으로 쓰면 굵기가 조용히 무시되어 "굵기 = 계수"라는 약속이 깨지므로
      // 인라인 style로 써야 한다.
      if (w != null) attrs.style = 'stroke-width:' + (0.9 + w * 5.2).toFixed(2);
      S('line', attrs, layer);

      var label = opt.edgeLabel ? opt.edgeLabel(e[0], e[1]) : null;
      if (label) {
        var lx = t.mx + t.px * 9, ly = t.my + t.py * 9;
        var tag = S('g', { 'class': 'gnn-tag gnn-tag--edge' }, layer);
        S('rect', { x: lx - 15, y: ly - 7, width: 30, height: 13, rx: 3 }, tag);
        S('text', { x: lx, y: ly + 3.4, 'text-anchor': 'middle', text: label }, tag);
      }
    });

    // 점찍은 현: 등록부 graph.edges에 없는 정점 쌍. 좌표만 빌려 쓰고 간선 목록은
    // 건드리지 않는다 — "정전 그래프는 G4 하나이며 확장은 정점을 더하기만 한다".
    // 실재 간선에 쓰는 점선(gnn-edge--off)과 획을 구별하려고 전용 클래스를 쓴다.
    (opt.extraEdges || []).forEach(function (e) {
      var t = trim(pos[e.a], pos[e.b], 0, 0);
      var attrs = {
        'class': 'gnn-edge gnn-edge--phantom',
        x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2
      };
      if (e.width != null) attrs.style = 'stroke-width:' + (0.9 + e.width * 5.2).toFixed(2);
      S('line', attrs, layer);
      if (e.label != null) {
        // labelOff — 숫자 상자를 현의 수직 방향으로 얼마나 띄울지. 기본 9는 간선과
        // 같은 값이고, 두 현이 교차하면서 상자가 정점 이름표를 덮는 자리에서만
        // 그림이 부호를 바꿔 반대쪽으로 더 띄운다(값·좌표는 그대로다).
        var off = (e.labelOff == null ? 9 : e.labelOff);
        var lx = t.mx + t.px * off, ly = t.my + t.py * off;
        var tag = S('g', { 'class': 'gnn-tag gnn-tag--edge' }, layer);
        S('rect', { x: lx - 15, y: ly - 7, width: 30, height: 13, rx: 3 }, tag);
        S('text', { x: lx, y: ly + 3.4, 'text-anchor': 'middle', text: e.label }, tag);
      }
    });

    // 화살(F): 메시지 또는 gradient
    (opt.arrows || []).forEach(function (a) {
      var t = trim(pos[a.from], pos[a.to], r + 2, r + 7);
      // 같은 간선 위의 두 방향이 겹치지 않도록 수직으로 민다.
      var off = a.offset || 0;
      var ox = t.px * off, oy = t.py * off;
      S('line', {
        'class': 'gnn-arrow' + (a.dim ? ' gnn-arrow--dim' : ''),
        x1: t.x1 + ox, y1: t.y1 + oy, x2: t.x2 + ox, y2: t.y2 + oy,
        'marker-end': opt.arrow
      }, layer);
      if (a.label) {
        var lx = t.mx + t.px * (11 + off), ly = t.my + t.py * (11 + off);
        var tag = S('g', {
          'class': 'gnn-tag gnn-tag--msg' + (a.dim ? ' gnn-tag--dim' : '')
        }, layer);
        S('rect', { x: lx - 17, y: ly - 7, width: 34, height: 13, rx: 3 }, tag);
        S('text', { x: lx, y: ly + 3.4, 'text-anchor': 'middle', text: a.label }, tag);
      }
    });

    // 원반(N): 정점
    graph.nodes.forEach(function (id) {
      var p = pos[id];
      var role = roles[id] || 'idle';
      var ge = S('g', { 'class': 'gnn-node gnn-node--' + role }, layer);
      S('circle', { cx: p[0], cy: p[1], r: r }, ge);
      if (role === 'labeled') {
        S('circle', { 'class': 'gnn-node__ring2', cx: p[0], cy: p[1], r: r - 4 }, ge);
      }
      if (opt.values && opt.values[id] != null) {
        S('text', {
          'class': 'gnn-node__val', x: p[0], y: p[1] + 4.5,
          'text-anchor': 'middle', text: String(opt.values[id])
        }, ge);
      }
      if (opt.marks && opt.marks[id] != null) {
        S('text', {
          'class': 'gnn-node__mark', x: p[0], y: p[1] - r - 3,
          'text-anchor': 'middle', text: String(opt.marks[id])
        }, ge);
      }
      var name = (opt.names && opt.names[id] != null) ? opt.names[id] : 'v' + id;
      if (name) {
        S('text', {
          'class': 'gnn-node__name', x: p[0], y: p[1] + r + 10,
          'text-anchor': 'middle', text: name
        }, ge);
      }
    });

    // 자기 고리: 원반 위쪽에 걸치는 반원. 굵기 식은 간선과 같다.
    // 원호 A 명령은 쓰지 않는다 — rx·ry와 플래그가 좌표로 오독되기 때문이다.
    graph.nodes.forEach(function (id) {
      var sl = opt.selfLoops && opt.selfLoops[id];
      if (!sl) return;
      var p = pos[id], top = p[1] - r;
      var attrs = {
        'class': 'gnn-edge gnn-edge--on', fill: 'none',
        d: 'M ' + (p[0] - 7) + ' ' + (top + 2) +
           ' C ' + (p[0] - 13) + ' ' + (top - 19) +
           ' ' + (p[0] + 13) + ' ' + (top - 19) +
           ' ' + (p[0] + 7) + ' ' + (top + 2)
      };
      if (sl.width != null) attrs.style = 'stroke-width:' + (0.9 + sl.width * 5.2).toFixed(2);
      S('path', attrs, layer);
      if (sl.label != null) {
        // dx는 간선 숫자 상자와 겹치는 자리에서만 옆으로 비키기 위한 것이다.
        var lx = p[0] + (sl.dx || 0), ly = top - 23;
        var tag = S('g', { 'class': 'gnn-tag gnn-tag--edge' }, layer);
        S('rect', { x: lx - 15, y: ly - 7, width: 30, height: 13, rx: 3 }, tag);
        S('text', { x: lx, y: ly + 3.4, 'text-anchor': 'middle', text: sl.label }, tag);
      }
    });

    return layer;
  }

  /* ══ 격자 표면 — drawGrid ══════════════════════════════════ */

  /**
   * 세로 = 정점 축, 가로 = 특성 축. 행 순서는 사이트 전체에서 영구 고정.
   *
   * opt = {
   *   x, y, cw, ch,
   *   nums: [[number]],            농도 계산용 원본 값 (없으면 농도 없음)
   *   text: [[string]],            칸에 찍을 문자열 (없으면 nums를 2자리로)
   *   rowLabels: [string], colLabels: [string],
   *   rowRoles: [role], rowMarks: [string],
   *   heading: string,             격자 위 제목
   *   scale: number,               농도 정규화 기준 (없으면 |nums| 최대)
   *   negPattern: url              음수 빗금 패턴
   * }
   * 반환 {x, y, w, h, cw, ch, rowY(i), colX(j)}
   */
  function drawGrid(g, opt) {
    var cw = opt.cw || 30, ch = opt.ch || 22;
    var nums = opt.nums || null;
    var text = opt.text || null;
    var rows = (nums || text).length;
    var cols = (nums || text)[0].length;
    var x0 = opt.x, y0 = opt.y;
    var layer = S('g', { 'class': 'gnn-surface gnn-surface--grid' }, g);

    var scale = opt.scale;
    if (nums && scale == null) {
      scale = 0;
      nums.forEach(function (r) {
        r.forEach(function (v) { scale = Math.max(scale, Math.abs(v)); });
      });
      if (scale === 0) scale = 1;
    }

    if (opt.heading) {
      S('text', {
        'class': 'gnn-grid__heading', x: x0,
        y: y0 - (opt.colLabels ? 16 : 7), text: opt.heading
      }, layer);
    }
    if (opt.colLabels) {
      opt.colLabels.forEach(function (lab, j) {
        S('text', {
          'class': 'gnn-grid__axis', x: x0 + j * cw + cw / 2, y: y0 - 2,
          'text-anchor': 'middle', text: lab
        }, layer);
      });
    }

    var i, j;
    for (i = 0; i < rows; i++) {
      for (j = 0; j < cols; j++) {
        var cx = x0 + j * cw, cy = y0 + i * ch;
        var cell = S('g', {
          'class': 'gnn-cell' + (opt.rowRoles && opt.rowRoles[i]
            ? ' gnn-cell--' + opt.rowRoles[i] : '')
        }, layer);
        S('rect', { x: cx, y: cy, width: cw, height: ch }, cell);
        if (nums) {
          var v = nums[i][j];
          var a = Math.min(1, Math.abs(v) / scale);
          if (a > 0.005) {
            S('rect', {
              'class': 'gnn-cell__fill', x: cx + 1, y: cy + 1,
              width: cw - 2, height: ch - 2,
              'fill-opacity': (0.10 + 0.72 * a).toFixed(3)
            }, cell);
          }
          if (v < -1e-9 && opt.negPattern) {
            S('rect', {
              'class': 'gnn-cell__neg', x: cx + 1, y: cy + 1,
              width: cw - 2, height: ch - 2, fill: opt.negPattern
            }, cell);
          }
        }
        var label = text ? text[i][j] : fx(nums[i][j], 2);
        S('text', {
          'class': 'gnn-cell__t', x: cx + cw / 2, y: cy + ch / 2 + 3.2,
          'text-anchor': 'middle', text: label
        }, cell);
      }
      if (opt.rowLabels) {
        S('text', {
          'class': 'gnn-grid__axis gnn-grid__axis--row',
          x: x0 - 4, y: y0 + i * ch + ch / 2 + 3.2,
          'text-anchor': 'end', text: opt.rowLabels[i]
        }, layer);
      }
      if (opt.rowMarks && opt.rowMarks[i]) {
        S('text', {
          'class': 'gnn-grid__mark',
          x: x0 + cols * cw + 4, y: y0 + i * ch + ch / 2 + 3.2,
          text: opt.rowMarks[i]
        }, layer);
      }
    }

    return {
      x: x0, y: y0, w: cols * cw, h: rows * ch, cw: cw, ch: ch,
      rowY: function (i) { return y0 + i * ch + ch / 2; },
      colX: function (j) { return x0 + j * cw + cw / 2; }
    };
  }

  /* ══ 막대 — drawBars ═══════════════════════════════════════ */

  /**
   * 0선 기준 좌우 막대. 정점 축 위에 살지 않는 양(모드별 계수·배수·기여)만
   * 여기에 그린다. 라벨은 u₁..u₄ 또는 k이며 v₁..v₄를 쓰지 않는다.
   *
   * opt = {
   *   x, y, w, rowH, barH,
   *   zero: 절대 x (없으면 x),
   *   scale: 값 1당 픽셀,
   *   values: [number], text: [string], labels: [string], notes: [string]
   * }
   * 반환 {x, y, w, h, rowY(i)}
   */
  function drawBars(g, opt) {
    var x0 = opt.x, y0 = opt.y, w = opt.w || 100;
    var rowH = opt.rowH || 22;
    var barH = opt.barH || Math.min(13, rowH - 8);
    var scale = opt.scale || 10;
    var zero = opt.zero != null ? opt.zero : x0;
    var vals = opt.values;
    var layer = S('g', { 'class': 'gnn-bars' }, g);

    S('line', {
      'class': 'gnn-bar__zero',
      x1: zero, y1: y0 + 1, x2: zero, y2: y0 + vals.length * rowH - 1
    }, layer);

    vals.forEach(function (v, i) {
      var cy = y0 + i * rowH + rowH / 2;
      // 음수 막대도 폭은 언제나 양수다. rect에 음수 width를 넣으면 렌더가 깨지고
      // viewBox 검사도 구간을 뒤집어 읽는다. 부호는 0선의 어느 쪽인가와
      // 병기된 값 숫자로만 읽힌다.
      var len = Math.abs(v) * scale;
      var neg = v < 0;
      S('rect', {
        'class': 'gnn-bar' + (neg ? ' gnn-bar--neg' : ''),
        x: neg ? zero - len : zero, y: cy - barH / 2,
        width: len, height: barH, rx: 1.5
      }, layer);

      if (opt.labels && opt.labels[i] != null) {
        S('text', {
          'class': 'gnn-bar__label', x: x0 - 4, y: cy + 3.2,
          'text-anchor': 'end', text: opt.labels[i]
        }, layer);
      }
      var val = opt.text ? opt.text[i] : fx(v, 2);
      S('text', {
        'class': 'gnn-bar__val',
        x: neg ? zero - len - 3 : zero + len + 3, y: cy + 3.2,
        'text-anchor': neg ? 'end' : 'start', text: val
      }, layer);
      if (opt.notes && opt.notes[i] != null) {
        S('text', {
          'class': 'gnn-bar__val', x: x0 + w + 4, y: cy + 3.2, text: opt.notes[i]
        }, layer);
      }
    });

    return {
      x: x0, y: y0, w: w, h: vals.length * rowH,
      rowY: function (i) { return y0 + i * rowH + rowH / 2; }
    };
  }

  /* ══ W 기둥 — drawBlock ════════════════════════════════════ */

  function drawBlock(g, opt) {
    var layer = S('g', { 'class': 'gnn-block' + (opt.muted ? ' gnn-block--muted' : '') }, g);
    S('rect', {
      x: opt.x, y: opt.y, width: opt.w, height: opt.h, rx: 3
    }, layer);
    S('text', {
      'class': 'gnn-block__t', x: opt.x + opt.w / 2, y: opt.y + opt.h / 2 + 1,
      'text-anchor': 'middle', text: opt.label
    }, layer);
    if (opt.sub) {
      S('text', {
        'class': 'gnn-block__sub', x: opt.x + opt.w / 2, y: opt.y + opt.h / 2 + 13,
        'text-anchor': 'middle', text: opt.sub
      }, layer);
    }
    return layer;
  }

  /* ══ S 축 — drawAxis ═══════════════════════════════════════ */

  /**
   * 정점 축 위에 살지 않는 양만 여기에 그린다(λ, 층 수, 행 간 거리).
   * opt = { x, y, w, min, max, ticks:[{v,label}], rows:[{label, marks:[{v,label,shape}]}] }
   */
  function drawAxis(g, opt) {
    var layer = S('g', { 'class': 'gnn-axis' }, g);
    var x0 = opt.x, w = opt.w, lo = opt.min, hi = opt.max;
    var at = function (v) { return x0 + (v - lo) / (hi - lo) * w; };
    var rows = opt.rows || [];
    var rowH = opt.rowH || 20;
    var baseY = opt.y;

    rows.forEach(function (row, ri) {
      var y = baseY + ri * rowH;
      S('line', { 'class': 'gnn-axis__line', x1: x0, y1: y, x2: x0 + w, y2: y }, layer);
      if (row.label) {
        S('text', {
          'class': 'gnn-axis__rowlabel', x: x0 - 5, y: y + 3.2,
          'text-anchor': 'end', text: row.label
        }, layer);
      }
      (row.marks || []).forEach(function (m) {
        var mx = at(m.v);
        var cls = 'gnn-axis__mark' + (m.cls ? ' ' + m.cls : '');
        if (m.shape === 'square') {
          S('rect', { 'class': cls, x: mx - 3.2, y: y - 3.2, width: 6.4, height: 6.4 }, layer);
        } else if (m.shape === 'tri') {
          S('path', {
            'class': cls,
            d: 'M ' + mx + ' ' + (y - 4) + ' L ' + (mx + 4) + ' ' + (y + 3.4) +
               ' L ' + (mx - 4) + ' ' + (y + 3.4) + ' Z'
          }, layer);
        } else {
          S('circle', { 'class': cls, cx: mx, cy: y, r: 3.4 }, layer);
        }
        if (m.label) {
          S('text', {
            'class': 'gnn-axis__mlabel', x: mx, y: y - 7,
            'text-anchor': 'middle', text: m.label
          }, layer);
        }
      });
    });

    var tickY = baseY + rows.length * rowH - rowH + 14;
    (opt.ticks || []).forEach(function (t) {
      var tx = at(t.v);
      S('line', {
        'class': 'gnn-axis__tick', x1: tx, y1: tickY - 4, x2: tx, y2: tickY
      }, layer);
      S('text', {
        'class': 'gnn-axis__tlabel', x: tx, y: tickY + 9,
        'text-anchor': 'middle', text: t.label
      }, layer);
    });
    if (opt.caption) {
      S('text', {
        'class': 'gnn-axis__caption', x: x0, y: tickY + 22, text: opt.caption
      }, layer);
    }
    return { at: at, bottom: tickY + (opt.caption ? 26 : 14) };
  }

  /* ══ 축 사이 흐름 표시 ═════════════════════════════════════ */

  /** 격자 왼쪽에서 행을 섞는 세로 화살 묶음 (정점 축 = Â). */
  function drawNodeAxisFlow(g, box, opt) {
    var layer = S('g', { 'class': 'gnn-flow gnn-flow--node' }, g);
    var x = box.x - (opt && opt.gap != null ? opt.gap : 12);
    S('line', {
      'class': 'gnn-flow__line', x1: x, y1: box.y + 3, x2: x, y2: box.y + box.h - 3,
      'marker-end': opt && opt.arrow, 'marker-start': opt && opt.arrow
    }, layer);
    if (opt && opt.labelAbove) {
      S('text', {
        'class': 'gnn-flow__t', x: x, y: box.y - 10,
        'text-anchor': 'middle', text: opt.label || '정점 축'
      }, layer);
    } else {
      S('text', {
        'class': 'gnn-flow__t', x: x - 3, y: box.y + box.h / 2,
        'text-anchor': 'end', text: (opt && opt.label) || '정점 축'
      }, layer);
    }
    return layer;
  }

  /** 격자 오른쪽에서 열을 섞는 가로 화살 (특성 축 = W). */
  function drawFeatureAxisFlow(g, box, opt) {
    var layer = S('g', { 'class': 'gnn-flow gnn-flow--feat' }, g);
    var y = box.y + box.h + (opt && opt.gap != null ? opt.gap : 11);
    S('line', {
      'class': 'gnn-flow__line', x1: box.x + 3, y1: y, x2: box.x + box.w - 3, y2: y,
      'marker-end': opt && opt.arrow, 'marker-start': opt && opt.arrow
    }, layer);
    S('text', {
      'class': 'gnn-flow__t', x: box.x + box.w / 2, y: y + 11,
      'text-anchor': 'middle', text: (opt && opt.label) || '특성 축'
    }, layer);
    return layer;
  }

  /* ══ 프레임 · 그림 셸 ══════════════════════════════════════ */

  function makeFrameSvg(parent, frame, id) {
    var L = NI3.LAYOUT;
    // span은 배치 등록부에 있는 값만 받는다. 없으면 'auto'다. 오타 하나가
    // 조용히 'auto'로 떨어지면 넓은 프레임이 좁은 칸에 갇혀도 아무도 모른다.
    var span = frame.span == null ? 'auto' : frame.span;
    if (L.spans.indexOf(span) < 0) {
      throw new Error('gnn: frame.span "' + span + '" 은(는) 없는 값이다. ' +
        '쓸 수 있는 값: ' + L.spans.join(', '));
    }
    // vb를 직접 적는 것은 기존 그림의 방식이다. 새 그림은 프리셋 이름과 높이만 준다.
    var preset = frame.preset && L.frame[frame.preset];
    if (!frame.vb && !preset) {
      throw new Error('gnn: frame에 vb도 preset도 없다' +
        (frame.preset ? ' (없는 preset "' + frame.preset + '")' : ''));
    }
    var vb = frame.vb || [0, 0, preset.w, frame.h];
    var svg = S('svg', {
      viewBox: vb.join(' '),
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-labelledby': id + '-t ' + id + '-d'
    }, parent);
    S('title', { id: id + '-t', text: frame.title }, svg);
    S('desc', { id: id + '-d', text: frame.desc }, svg);

    var defs = S('defs', null, svg);
    var marker = S('marker', {
      id: id + '-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 5.5, markerHeight: 5.5, orient: 'auto-start-reverse'
    }, defs);
    S('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' }, marker);

    var pat = S('pattern', {
      id: id + '-neg', width: 5, height: 5,
      patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    }, defs);
    S('line', {
      'class': 'gnn-hatch', x1: 0, y1: 0, x2: 0, y2: 5
    }, pat);

    return {
      svg: svg,
      root: S('g', null, svg),
      arrow: 'url(#' + id + '-arrow)',
      negPattern: 'url(#' + id + '-neg)'
    };
  }

  /**
   * 선언 명세 하나를 <figure>로 만든다.
   * 실패하면 예외를 던진다 — 호출자가 무JS 폴백을 유지할 수 있어야 하기 때문이다.
   */
  function buildFigure(spec) {
    var fid = uid('gnnfig');
    var fig = H('figure', { 'class': 'gnn-fig', 'data-gnn-fig-id': spec.id }, null);
    var state = {};
    if (spec.variant) state[spec.variant.name] = spec.variant.initial;

    var status = null;
    if (spec.variant) {
      var controls = H('div', { 'class': 'gnn-fig__controls' }, fig);
      var fs2 = H('fieldset', { 'class': 'gnn-fieldset' }, controls);
      H('legend', { 'class': 'gnn-legend', text: spec.variant.legend }, fs2);
      var wrap = H('div', { 'class': 'gnn-radios' }, fs2);
      spec.variant.options.forEach(function (o, k) {
        var rid = fid + '-v' + k;
        var lab = H('label', { 'class': 'gnn-radio', 'for': rid }, wrap);
        var input = H('input', {
          type: 'radio', name: fid + '-var', id: rid, value: String(o.value)
        }, lab);
        if (o.value === spec.variant.initial) input.checked = true;
        H('span', { text: o.label }, lab);
        input.addEventListener('change', function () {
          if (!input.checked) return;
          state[spec.variant.name] = o.value;
          paint();
        });
      });
      if (spec.variant.wrong) {
        H('p', { 'class': 'gnn-fieldset__note', text: spec.variant.wrong }, fs2);
      }
      status = H('p', {
        'class': 'gnn-sr', role: 'status', 'aria-live': 'polite'
      }, fig);
    }

    var strip = H('div', { 'class': 'gnn-fig__frames' }, fig);

    var cap = H('figcaption', { 'class': 'gnn-fig__cap' }, fig);
    if (spec.badge) H('span', { 'class': 'gnn-fig__badge', text: spec.badge }, cap);
    H('b', { 'class': 'gnn-fig__title', text: spec.title }, cap);
    H('span', { 'class': 'gnn-fig__lead', text: ' — ' + spec.caption }, cap);
    if (spec.falsify) {
      H('span', { 'class': 'gnn-fig__falsify', text: '거짓이라면: ' + spec.falsify }, cap);
    }

    function paint() {
      var frames = spec.frames(state);
      clear(strip);
      frames.forEach(function (frame, k) {
        var cell = H('div', {
          'class': 'gnn-frame' + (frame.span === 'full' ? ' gnn-frame--full' : '')
        }, strip);
        var stage = H('div', { 'class': 'gnn-frame__stage' }, cell);
        var ctx = makeFrameSvg(stage, frame, fid + '-f' + k);
        frame.draw(ctx.root, {
          S: S, arrow: ctx.arrow, negPattern: ctx.negPattern,
          drawGraph: drawGraph, drawGrid: drawGrid, drawAxis: drawAxis,
          drawBars: drawBars, drawBlock: drawBlock,
          drawNodeAxisFlow: drawNodeAxisFlow,
          drawFeatureAxisFlow: drawFeatureAxisFlow
        });
        H('p', { 'class': 'gnn-frame__cap', text: frame.caption }, cell);
      });
      if (status) {
        status.textContent = frames.map(function (f) { return f.desc; }).join(' ');
      }
    }

    paint();
    return fig;
  }

  NI3.px = {
    S: S, H: H, clear: clear, uid: uid, fx: fx, fs: fs, sub: sub, trim: trim,
    drawGraph: drawGraph, drawGrid: drawGrid, drawAxis: drawAxis,
    drawBars: drawBars, drawBlock: drawBlock,
    drawNodeAxisFlow: drawNodeAxisFlow, drawFeatureAxisFlow: drawFeatureAxisFlow,
    buildFigure: buildFigure
  };
})(typeof window !== 'undefined' ? window : this);
