/**
 * tools/build-manifest.mjs
 *
 * site/ 가 지금의 docs/ 와 mkdocs.yml 에서 나온 것인지 한 줄로 판정한다.
 * 입력(정렬한 상대 경로 + 내용)을 sha256 한 번으로 묶어 site/build-manifest.json 에 적는다.
 *
 *   node tools/build-manifest.mjs           빌드 직후에 기록한다
 *   node tools/build-manifest.mjs --check   낡았으면 1로 끝난다 (렌더 검사의 관문)
 *
 * 브라우저를 띄우는 검사는 전부 site/ 를 본다. 낡은 site/ 를 찍은 스크린샷은
 * 거짓 통과·거짓 실패를 함께 만들므로, 여기서 먼저 막는다. 의존성은 없다.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'build-manifest.json');

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const files = [join(ROOT, 'mkdocs.yml'), ...walk(join(ROOT, 'docs'))]
  .map((p) => relative(ROOT, p).split(sep).join('/'))
  .sort();
const h = createHash('sha256');
for (const rel of files) {
  h.update(rel, 'utf8');
  h.update('\0');
  h.update(readFileSync(join(ROOT, rel)));
  h.update('\0');
}
const inputHash = h.digest('hex');
const short = (s) => s.slice(0, 12);

if (process.argv.slice(2).includes('--check')) {
  let prev = null;
  try {
    prev = JSON.parse(readFileSync(OUT, 'utf8'));
  } catch { prev = null; }
  if (!prev || typeof prev.inputHash !== 'string') {
    console.error('site/build-manifest.json 이 없거나 읽을 수 없다 — .\\tools\\build.ps1 을 먼저 실행한다.');
    process.exit(1);
  }
  if (prev.inputHash !== inputHash) {
    console.error(`site/ 가 낡았다 — docs/·mkdocs.yml 이 바뀌었다 (${short(prev.inputHash)} → ${short(inputHash)}).` +
      ' .\\tools\\build.ps1 을 다시 실행한다.');
    process.exit(1);
  }
  console.log(`site/ 최신 (${short(inputHash)}, 입력 ${files.length}개, 빌드 ${prev.builtAt})`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  const rec = { inputHash, fileCount: files.length, builtAt: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(rec, null, 2) + '\n', 'utf8');
  console.log(`site/build-manifest.json 기록 (${short(inputHash)}, 입력 ${files.length}개)`);
}
