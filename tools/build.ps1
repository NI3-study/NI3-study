# tools/build.ps1 — 사이트를 엄격 빌드하고 site/ 의 입력 해시를 기록한다.
# 렌더 검사(tools/render-qa.mjs)는 이 스크립트가 남긴 매니페스트를 관문으로 쓴다.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& .\.venv\Scripts\python.exe -m mkdocs build --strict
if ($LASTEXITCODE -ne 0) { throw "mkdocs build --strict 실패 (exit $LASTEXITCODE)" }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
if (-not (Test-Path $node)) { throw "node를 찾을 수 없다: $node" }
& $node tools/build-manifest.mjs
if ($LASTEXITCODE -ne 0) { throw "build-manifest 기록 실패 (exit $LASTEXITCODE)" }
Write-Host "다음: node tools/render-qa.mjs  (렌더 검사는 세션당 한 번, 결과는 .cache/qa/render/report.json)"
