/*!
 * gnn/mount.js — NI3 GNN Study · 시각 계보 L3
 *
 * id → 명세 표를 찾아 <figure>를 마운트한다.
 * 렌더가 성공한 뒤에만 무JS 폴백을 감춘다. JS가 늦게 깨져도 빈 상자가 남지 않는다.
 */
(function (global) {
  'use strict';

  var NI3 = (global.NI3GNN = global.NI3GNN || {});

  // 이전 릴리스의 data-gnn-viz 값 별칭. 앵커는 동결이고 속성만 매핑한다.
  var LEGACY = {
    'message-passing': 'sync-update',
    'normalization': 'norm-3up',
    'receptive-field': 'depth-frames'
  };

  function mount(slot) {
    if (slot.getAttribute('data-gnn-ready')) return;

    var id = slot.getAttribute('data-gnn-fig') ||
             LEGACY[slot.getAttribute('data-gnn-viz')];
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
