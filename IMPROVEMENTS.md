# Obsidian LaTeX Compiler - Improvements & Gaps

## Status reality check
- ✅ Build passes: `npm run build` produces main.js
- ✅ Tests pass: 12 parser unit tests + integration + smoke tests
- ✅ PDF preview works via iframe

## High-priority hardening - ALL ADDRESSED ✅
- ✅ `shell: false` in `src/compiler/LatexmkBackend.ts` (line 69)
- ✅ PATH handling uses `path.delimiter` via `getPathSeparator()` in platform.ts
- ✅ Process-tree cancellation with SIGKILL fallback (LatexmkBackend.ts:292-320)
- ✅ `-file-line-error` and `-synctex=1` flags added
- ✅ Desktop-only enforced via manifest.json `isDesktopOnly: true`

## Missing features vs roadmap - ALL ADDRESSED ✅
- ✅ Watch mode implemented (FileWatcher.ts, vault events + debounce)
- ✅ Per-project config file (ProjectConfig.ts, .obsidian-latex.json)
- ✅ Clean command uses `latexmk -C` (LatexmkBackend.ts:203)
- ✅ Log access via "Show build log" command
- ⚠️ Queue semantics: Currently cancels prior job (works, could be enhanced)

## Remaining Enhancements (P2/Future)
- [ ] ProjectsView sidebar for project management
- [ ] Queue semantics improvement (per-project serial queue)
- [ ] Mobile notice (user-facing message beyond manifest)

## Parsing and diagnostics - ADDRESSED ✅
- ✅ `-file-line-error` flag improves file/line accuracy
- ✅ BibTeX/Biber patterns added (patterns.ts:65-90)
- ✅ Graceful fallback shows raw log when parsing fails

## Testing - ADDRESSED ✅
- ✅ Integration tests for LatexmkBackend (test/integration/compile.test.ts)
- ✅ Smoke tests for PATH detection (test/e2e/smoke.test.ts)
- Could expand: orchestrator tests, ProjectManager tests

## Dependency/packaging - ADDRESSED ✅
- ✅ `pdfjs-dist` removed from package.json
- 📝 Install instructions in settings.ts (install help section)
