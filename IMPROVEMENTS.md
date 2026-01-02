# Obsidian LaTeX Compiler – Improvements & Gaps

## Status reality check
- Build/test claims in `PROJECT.md` are not verifiable: only parser unit tests exist; no compile/integration/e2e coverage.
- PDF preview uses an iframe; `pdfjs-dist` is unused. Consider removing the dependency or switching to the built-in Obsidian PDF viewer instead of bundling PDF.js.

## High-priority hardening
- Replace `spawn(..., shell: true)` in `src/compiler/LatexmkBackend.ts` with `shell: false`; validate/escape user-supplied args and use `path.delimiter` for PATH prepending.
- Add `-file-line-error` (and `-synctex=1` for future sync) via latexmk options; prefer `-cd` or set `cwd` to the main file’s directory to preserve relative `\input{}` paths.
- Implement process-tree cancellation and a SIGKILL fallback after timeout; latexmk often leaves child TeX processes alive.
- Normalize PATH handling: prepend `texPath` using `path.delimiter`; document macOS GUI PATH pitfalls; add tests for PATH detection helpers.
- Guard desktop-only behavior: manifest already sets `isDesktopOnly: true`, but add a user-facing notice if loaded on mobile.

## Missing features vs roadmap
- Watch mode: add vault-based file watching (avoid chokidar native module if possible), debounce recompiles, ignore output dir, commands to start/stop, and auto-refresh PDF.
- Per-project config file (`.obsidian-latex.json`) and sidebar view: allow engine/output/shell-escape overrides, latexmkrc detection, and per-project clean/compile commands.
- Clean command should call `latexmk -C -outdir` per project instead of raw `rm -r`.
- Log access: add a “Show build log” command to open `.latex-out/build.log`.
- Queue semantics: orchestrator currently cancels the prior job; consider per-project serial queue and cross-project concurrency limit.

## Parsing and diagnostics
- Improve file/line accuracy by relying on `-file-line-error` output; current paren-stack heuristic will misattribute in common logs.
- Expand patterns for BibTeX/Biber errors and sync with suggestions; add graceful fallback to show raw log when parsing fails.

## Testing gaps
- Add integration tests for `LatexmkBackend` against `test/integration/sample-project` (skip when latexmk not available).
- Add smoke tests for PATH detection and engine selection.
- Add UI-free tests for orchestrator cancel/timeout behavior.

## Dependency/packaging
- Remove `pdfjs-dist` if continuing to use the built-in viewer; otherwise implement a lazy-loaded PDF.js view.
- Document install instructions per OS (PATH hints), and add a small troubleshooting guide to the repo (not just in code comments).
