window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"], ["$", "$"]],
    displayMath: [["\\[", "\\]"], ["$$", "$$"]],
    processEscapes: true,
    processEnvironments: true
  },
  options: {
    ignoreHtmlClass: ".*|",
    processHtmlClass: "arithmatex"
  }
};

/* 본문 열보다 실제로 넓은 인라인 수식에만 .is-wide 를 단다. extra.css는
   그때만 스크롤 상자를 만든다(그 외에는 글줄을 건드리지 않는다).
   측정 전에 클래스를 걷어 원래 폭으로 되돌리므로 몇 번을 돌려도 결과가 같다. */
let wideTimer;
function markWideMath() {
  const all = [...document.querySelectorAll('span.arithmatex > mjx-container')];
  all.forEach((m) => m.classList.remove('is-wide'));
  const col = (m) => { // 가장 가까운 블록 상자(문단·목록·표 칸, 없으면 .md-typeset)
    let p = m.parentElement;
    while (p && !p.clientWidth) p = p.parentElement;
    return p ? p.clientWidth : Infinity;
  };
  all.filter((m) => m.getBoundingClientRect().width > col(m) + 1)
    .forEach((m) => m.classList.add('is-wide'));
}

document$.subscribe(() => {
  MathJax.startup.output.clearCache();
  MathJax.typesetClear();
  MathJax.texReset();
  MathJax.typesetPromise().then(markWideMath);
});

// 화면을 돌리면 열 폭이 바뀐다. 디바운스해서 다시 잰다.
window.addEventListener('resize', () => {
  clearTimeout(wideTimer);
  wideTimer = setTimeout(markWideMath, 150);
});
