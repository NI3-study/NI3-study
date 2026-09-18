/*!
 * gnn/mount.js — NI3 GNN Study · 시각 계보 L3
 *
 * id → 명세 표를 찾아 <figure>를 마운트한다.
 * 렌더가 성공한 뒤에만 무JS 폴백을 감춘다. JS가 늦게 깨져도 빈 상자가 남지 않는다.
 */
(function (global) {
  'use strict';

  var NI3 = (global.NI3GNN = global.NI3GNN || {});

  // 이전 릴리스의 속성 값 별칭. 앵커는 동결이고 속성만 매핑한다.
  // data-gnn-viz(2릴리스 전)와 data-gnn-fig(직전 릴리스) 양쪽을 같은 표로 받는다.
  var LEGACY = {
    'message-passing': 'state-transition',
    'sync-update': 'state-transition',
    'normalization': 'norm-3up',
    'receptive-field': 'depth-frames'
  };

  function mount(slot) {
    if (slot.getAttribute('data-gnn-ready')) return;

    var id = slot.getAttribute('data-gnn-fig') || slot.getAttribute('data-gnn-viz');
    if (!(NI3.figures && NI3.figures[id])) id = LEGACY[id];
    var make = id && NI3.figures && NI3.figures[id];
    if (!make) return;

    var spec, fig;
    try {
      spec = make();
      fig = NI3.px.buildFigure(spec);
    } catch (err) {
      // 실패하면 아무것도 건드리지 않는다 — 폴백 문장이 그대로 남아야 한다.
      slot.setAttribute('data-gnn-ready', 'failed');
      if (global.console && global.console.warn) {
        global.console.warn('[gnn] figure "' + id + '" render failed', err);
      }
      return;
    }

    // 열 수는 직접 세지 않는다. 최소 프레임 폭만 주고 auto-fit에 맡겨야
    // 좁은 화면에서 글자가 죽지 않는다(넓으면 좌→우, 좁으면 위→아래).
    var MIN = { 1: '100%', 2: '16rem', 3: '11rem' };
    fig.style.setProperty('--gnn-min', MIN[spec.cols] || '16rem');
    // 무대 최소 폭도 CSS에 적지 않고 등록부에서 내보낸다 — 프레임을 넓히면
    // 스타일시트를 고치지 않아도 배율 ≥ 1 이 따라온다.
    fig.style.setProperty('--gnn-stage-min', NI3.LAYOUT.minStageWidth + 'px');
    slot.insertBefore(fig, slot.firstChild);

    Array.prototype.forEach.call(
      slot.querySelectorAll('.gnn-fallback'),
      function (el) { el.hidden = true; }
    );
    slot.setAttribute('data-gnn-ready', '1');
  }

  function init() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-gnn-fig], [data-gnn-viz]'),
      mount
    );
  }

  NI3.mount = { init: init, mount: mount };

  if (global.document$ && typeof global.document$.subscribe === 'function') {
    global.document$.subscribe(init);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
