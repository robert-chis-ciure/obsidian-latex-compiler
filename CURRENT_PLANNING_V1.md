# Obsidian LaTeX Compiler - Current Planning v1

> **Document Purpose**: Consolidated planning document for AI agents and developers
> **Created**: 2026-01-02 | **Status**: Ready for implementation
> **Sources**: PROJECT.md (Claude), IMPROVEMENTS.md (GPT-5.1-Codex-Max)

---

## Executive Summary

The MVP (Phase 1) is complete and all critical issues have been resolved:

| Area | Status | Priority |
|------|--------|----------|
| Core compilation | ✅ Working | - |
| Parser (20+ patterns) | ✅ Working | - |
| Security hardening | ✅ Complete | - |
| Testing coverage | ✅ Adequate | - |
| Watch mode | ✅ Implemented | - |
| Per-project config | ✅ Implemented | - |
| ProjectsView sidebar | ❌ Not started | P2 |

---

## Repo Scan: Remaining Work (based on current tree)

This section captures what is still missing after reviewing the repository.

### P0 (Release-Ready)
All P0 items have been resolved:
- ✅ `shell: false` in all spawn calls (LatexmkBackend.ts:69)
- ✅ Process-tree cancellation with SIGKILL fallback (LatexmkBackend.ts:292-320)
- ✅ Integration tests exist (test/integration/compile.test.ts)
- ✅ Smoke tests exist (test/e2e/smoke.test.ts)
- ✅ `-file-line-error` flag added (LatexmkBackend.ts:249)
- ✅ `pdfjs-dist` removed from package.json

### P1 (Completed)
All P1 items have been resolved:
- ✅ `-synctex=1` flag added (LatexmkBackend.ts:250)
- ✅ Clean command uses `latexmk -C` (LatexmkBackend.ts:203)
- ✅ "Show Build Log" command (main.ts:108)
- ✅ Watch mode with vault events + debounce (FileWatcher.ts)

### P2 (Future)
- ❌ ProjectsView sidebar - UI view showing all projects
- ⚠️ Queue semantics improvement - optional enhancement

### Already resolved (moved from remaining)
- PATH delimiter handling uses `getPathSeparator()` in `src/utils/platform.ts`
- ProjectConfig.ts created for per-project config file support
- .latexmkrc detection implemented in ProjectManager.ts
- BibTeX/Biber patterns added to parser (patterns.ts:65-90)
- FILE_LINE_ERROR pattern added (patterns.ts:90)
- Graceful fallback when parsing fails (TeXLogParser.ts:22-36)

---

## Part 1: Critical Issues (P0 - Fix Before Release)

### 1.1 Security: Shell Injection Risk

**Current Problem** (in `src/compiler/LatexmkBackend.ts`):
```typescript
// VULNERABLE: shell: true allows command injection
spawn('latexmk', args, {
  cwd: project.rootPath,
  shell: true,  // ← SECURITY RISK
  env: this.getEnv(),
});
```

**Required Fix**:
```typescript
// SAFE: shell: false with explicit args array
spawn('latexmk', args, {
  cwd: project.rootPath,
  shell: false,
  env: this.getEnv(),
});

// Also: validate/sanitize all user-supplied paths before use
```

**Files to modify**:
- `src/compiler/LatexmkBackend.ts` - Remove `shell: true`, validate args
- `src/utils/platform.ts` - Add path sanitization helpers

### 1.2 PATH Handling Bug

**Current Problem**:
```typescript
// WRONG: Uses Unix colon separator on all platforms
env.PATH = `${this.settings.texPath}:${env.PATH}`;
```

**Required Fix**:
```typescript
import * as path from 'path';

// CORRECT: Use platform-appropriate separator
env.PATH = `${this.settings.texPath}${path.delimiter}${env.PATH}`;
```

**Files to modify**:
- `src/compiler/LatexmkBackend.ts`
- `src/utils/platform.ts`

### 1.3 Process Cancellation Incomplete

**Current Problem**: SIGTERM doesn't kill child TeX processes spawned by latexmk.

**Required Fix**:
```typescript
// In CompileOrchestrator.ts
async cancelJob(jobId: string): Promise<void> {
  const job = this.activeJobs.get(jobId);
  if (job?.process) {
    // Kill entire process tree
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', job.process.pid.toString(), '/T', '/F']);
    } else {
      process.kill(-job.process.pid, 'SIGTERM');
    }

    // SIGKILL fallback after 5 seconds
    setTimeout(() => {
      if (job.status === 'running') {
        process.kill(-job.process.pid, 'SIGKILL');
      }
    }, 5000);
  }
}
```

**Files to modify**:
- `src/compiler/CompileOrchestrator.ts`
- `src/compiler/LatexmkBackend.ts` - spawn with `detached: true` for process groups

### 1.4 Testing Coverage Gap

**Current State**: Only 12 unit tests for parser. No integration/e2e tests.

**Required Tests**:

| Test Type | File | Coverage Target |
|-----------|------|-----------------|
| Integration | `test/integration/compile.test.ts` | LatexmkBackend against sample project |
| Smoke | `test/e2e/smoke.test.ts` | PATH detection, engine selection |
| Unit | `test/compiler/orchestrator.test.ts` | Cancel/timeout behavior |

**Acceptance Criteria**:
- [ ] Integration tests compile `test/integration/sample-project/`
- [ ] Tests skip gracefully when latexmk unavailable
- [ ] Cancel/timeout tests use mock processes

### 1.5 Unused Dependency

**Problem**: `pdfjs-dist` in package.json is never imported. PDF preview uses iframe.

**Options**:
1. **Remove it** (recommended for MVP) - reduces bundle, iframe works fine
2. **Actually use it** - better integration but more work

**Decision**: Remove `pdfjs-dist` from package.json for now.

---

## Part 2: Latexmk Improvements (P0-P1)

### 2.1 Add Essential Flags

**Current**:
```bash
latexmk -pdf -interaction=nonstopmode -outdir=.latex-out main.tex
```

**Improved**:
```bash
latexmk -pdf -interaction=nonstopmode -file-line-error -synctex=1 -outdir=.latex-out main.tex
```

| Flag | Purpose | Priority |
|------|---------|----------|
| `-file-line-error` | Better error locations for parser | P0 |
| `-synctex=1` | Enable SyncTeX for future PDF↔source sync | P1 |
| `-cd` | Change to main file's directory (helps relative paths) | P1 |

**File to modify**: `src/compiler/LatexmkBackend.ts` - `buildArgs()` method

### 2.2 Clean Command Fix

**Current** (in `main.ts`):
```typescript
// WRONG: Uses raw fs.rm
fs.rmSync(outputPath, { recursive: true });
```

**Improved**:
```typescript
// BETTER: Use latexmk's clean which knows exactly what to remove
spawn('latexmk', ['-C', `-outdir=${project.outputDir}`, project.mainFile], {
  cwd: project.rootPath,
  shell: false,
});
```

---

## Part 3: Phase 2 - Watch Mode

### 3.1 Requirements

| Requirement | Details |
|-------------|---------|
| File watching | Monitor `.tex`, `.bib`, `.cls`, `.sty` files |
| Debounce | 500ms default (configurable) |
| Ignore | `.latex-out/`, `node_modules/`, `.git/` |
| Commands | "Watch Project", "Stop Watching" |
| Persistence | Remember watch state across restarts |

### 3.2 Implementation Approach

**Avoid chokidar** (native module issues in Obsidian). Use Obsidian's vault events:

```typescript
// In ProjectManager.ts
startWatching(project: LaTeXProjectConfig) {
  // Use Obsidian's vault API instead of chokidar
  this.app.vault.on('modify', (file) => {
    if (this.shouldTriggerRecompile(file, project)) {
      this.debouncedCompile(project);
    }
  });
}

private shouldTriggerRecompile(file: TAbstractFile, project: LaTeXProjectConfig): boolean {
  // Check if file is in project folder
  // Check extension is .tex/.bib/.cls/.sty
  // Check not in output directory
}
```

### 3.3 Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/fileWatcher.ts` | Create | Vault-based file watching wrapper |
| `src/project/ProjectManager.ts` | Modify | Add watch state management |
| `src/main.ts` | Modify | Add watch/stop-watch commands |
| `src/views/StatusBarItem.ts` | Modify | Show watch indicator |

---

## Part 4: Phase 3 - Per-Project Configuration

### 4.1 Config File Format

**File**: `.obsidian-latex.json` in project root

```json
{
  "mainFile": "thesis.tex",
  "engine": "xelatex",
  "outputDir": ".build",
  "shellEscape": false,
  "extraArgs": ["-synctex=1"],
  "latexmkrc": ".latexmkrc"
}
```

### 4.2 Config Resolution Order

1. `.obsidian-latex.json` in project folder (highest priority)
2. Plugin settings (global defaults)
3. Built-in defaults (lowest priority)

### 4.3 Files to Create/Modify

| File | Action |
|------|--------|
| `src/project/ProjectConfig.ts` | Create - config file loading/saving |
| `src/views/ProjectsView.ts` | Create - sidebar project list |
| `src/settings.ts` | Modify - per-project settings UI |

---

## Part 5: Parser Improvements

### 5.1 Use `-file-line-error` Output

With `-file-line-error`, TeX outputs:
```
./chapter1.tex:15: Undefined control sequence.
```

**New pattern to add** (`src/parser/patterns.ts`):
```typescript
export const FILE_LINE_ERROR = /^(.+):(\d+):\s*(.+)$/;
```

### 5.2 Add BibTeX/Biber Patterns

```typescript
// Missing patterns to add
export const BIBTEX_ERROR = /^I\s+couldn't\s+open\s+(?:database\s+file|file\s+name)\s+(.+)/;
export const BIBER_ERROR = /^ERROR\s+-\s+(.+)/;
export const BIBTEX_WARNING = /^Warning--(.+)/;
```

### 5.3 Graceful Fallback

When parsing fails completely, show raw log:

```typescript
// In TeXLogParser.ts
parse(logContent: string, projectRoot: string): Diagnostic[] {
  try {
    return this.parseStructured(logContent, projectRoot);
  } catch (e) {
    // Fallback: return single diagnostic with raw log
    return [{
      severity: 'error',
      file: 'unknown',
      line: null,
      message: 'Log parsing failed - showing raw output',
      rawText: logContent.slice(0, 2000),
      code: 'PARSE_FAILED',
    }];
  }
}
```

---

## Part 6: Implementation Checklist

### P0 - Critical (All Complete) ✅

- [x] **SEC-1**: Replace `shell: true` with `shell: false` in LatexmkBackend
- [x] **SEC-2**: Fix PATH delimiter to use `path.delimiter`
- [x] **SEC-3**: Implement process-tree killing with SIGKILL fallback
- [x] **TEST-1**: Add integration tests for LatexmkBackend
- [x] **TEST-2**: Add smoke tests for PATH detection
- [x] **DEP-1**: Remove unused `pdfjs-dist` dependency
- [x] **LATEXMK-1**: Add `-file-line-error` flag

### P1 - Important (All Complete) ✅

- [x] **WATCH-1**: Implement vault-based file watching
- [x] **WATCH-2**: Add watch/stop-watch commands
- [x] **WATCH-3**: Add debounce with configurable delay
- [x] **LATEXMK-2**: Add `-synctex=1` flag
- [x] **LATEXMK-3**: Use `latexmk -C` for clean command
- [x] **CMD-1**: Add "Show Build Log" command

### P2 - Nice to Have (Partial)

- [x] **CONFIG-1**: Support `.obsidian-latex.json` per project
- [ ] **CONFIG-2**: Create ProjectsView sidebar
- [x] **CONFIG-3**: Detect and use `.latexmkrc`
- [x] **PARSER-1**: Add BibTeX/Biber error patterns
- [x] **PARSER-2**: Use `-file-line-error` output format

---

## Part 7: File Modification Summary

| File | Changes Required | Priority |
|------|-----------------|----------|
| `src/compiler/LatexmkBackend.ts` | shell:false, path.delimiter, -file-line-error | P0 |
| `src/compiler/CompileOrchestrator.ts` | Process tree killing | P0 |
| `src/utils/platform.ts` | Path sanitization | P0 |
| `package.json` | Remove pdfjs-dist | P0 |
| `test/integration/compile.test.ts` | Create integration tests | P0 |
| `src/main.ts` | Watch commands, show-log command | P1 |
| `src/project/ProjectManager.ts` | Watch state management | P1 |
| `src/utils/fileWatcher.ts` | Create (vault-based) | P1 |
| `src/parser/patterns.ts` | BibTeX patterns | P2 |
| `src/project/ProjectConfig.ts` | Create | P2 |
| `src/views/ProjectsView.ts` | Create | P2 |

---

## Part 8: Acceptance Criteria for v0.2.0

### Must Have (P0 complete) ✅
- [x] No `shell: true` in any spawn calls
- [x] PATH works correctly on Windows (uses `;` separator)
- [x] Cancel actually kills TeX processes
- [x] Integration tests pass on macOS
- [x] Error locations accurate with `-file-line-error`

### Should Have (P1 complete) ✅
- [x] Watch mode triggers recompile on .tex save
- [x] "Show Build Log" command works
- [x] Clean uses `latexmk -C`

### Could Have (P2 partial)
- [x] Per-project config file support
- [ ] Projects sidebar view

---

## Appendix A: Key File Locations

```
obsidian-latex-compiler/
├── src/
│   ├── main.ts                    # Plugin entry, commands
│   ├── settings.ts                # Settings UI
│   ├── types.ts                   # TypeScript interfaces
│   ├── compiler/
│   │   ├── LatexmkBackend.ts      # ← SECURITY FIXES HERE
│   │   └── CompileOrchestrator.ts # ← PROCESS KILLING HERE
│   ├── parser/
│   │   ├── TeXLogParser.ts        # Log parsing
│   │   └── patterns.ts            # ← ADD BIBTEX PATTERNS
│   ├── project/
│   │   └── ProjectManager.ts      # ← ADD WATCH STATE
│   └── utils/
│       └── platform.ts            # ← FIX PATH DELIMITER
├── test/
│   ├── parser/                    # ✅ Existing unit tests
│   └── integration/               # ← ADD TESTS HERE
└── package.json                   # ← REMOVE pdfjs-dist
```

---

## Appendix B: Command Reference

```bash
# Build
npm run build

# Test (current: 12 passing)
npm test

# Development watch
npm run dev
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1 | 2026-01-02 | Claude (Opus 4.5) | Initial consolidated plan from PROJECT.md + IMPROVEMENTS.md |
| v1.1 | 2026-01-03 | Claude (Sonnet 4.5) | Updated to reflect actual implementation state - P0/P1 complete |
