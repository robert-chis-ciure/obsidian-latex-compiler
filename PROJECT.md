# Obsidian LaTeX Compiler Plugin

> **Status**: MVP Complete | **Version**: 0.1.0 | **Last Updated**: 2026-01-02

An Obsidian community plugin providing "Overleaf-grade" local LaTeX compilation with multi-file project support, structured error reporting, and PDF preview.

---

## Current Status Summary

### What's Been Built (MVP - Phase 1) ✅

| Component | Status | File(s) |
|-----------|--------|---------|
| Plugin scaffold | ✅ Complete | `main.ts`, `manifest.json`, `package.json` |
| Settings UI | ✅ Complete | `src/settings.ts` |
| TeX path auto-detection | ✅ Complete | `src/utils/platform.ts` |
| LatexmkBackend compiler | ✅ Complete | `src/compiler/LatexmkBackend.ts` |
| Compile orchestrator | ✅ Complete | `src/compiler/CompileOrchestrator.ts` |
| TeX log parser | ✅ Complete | `src/parser/TeXLogParser.ts` |
| Diagnostics view | ✅ Complete | `src/views/DiagnosticsView.ts` |
| PDF preview view | ✅ Complete | `src/views/PDFPreviewView.ts` |
| Status bar indicator | ✅ Complete | `src/views/StatusBarItem.ts` |
| Project manager | ✅ Complete | `src/project/ProjectManager.ts` |
| Unit tests | ✅ Complete | `test/parser/TeXLogParser.test.ts` |

### Build & Test Status

```bash
npm run build  # ✅ Passes - outputs main.js (31KB minified)
npm test       # ✅ 12/12 tests passing
```

### Features Working

- [x] Compile LaTeX projects via latexmk
- [x] Engine selection (pdfLaTeX, XeLaTeX, LuaLaTeX)
- [x] Parse 20+ error/warning patterns from TeX logs
- [x] Click-to-source navigation from diagnostics
- [x] PDF preview with zoom controls
- [x] Status bar build indicator
- [x] Cross-platform PATH discovery (macOS/Windows/Linux)
- [x] Shell-escape toggle with security warning
- [x] Project discovery (finds folders with .tex files)
- [x] Watch mode with auto-recompile
- [x] Per-project configuration (.obsidian-latex.json)
- [x] Show Build Log command
- [x] BibTeX/Biber error parsing
- [x] .latexmkrc detection

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    main.ts (Plugin Entry)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Commands          Settings UI         Status Bar           │
│  - compile         - texPath           - build status       │
│  - clean           - engine            - click → diagnostics│
│  - check-install   - shellEscape                            │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ProjectManager              CompileOrchestrator            │
│  - find .tex folders         - job queue                    │
│  - project config            - spawn child_process          │
│  - entrypoint discovery      - capture stdout/stderr        │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  LatexmkBackend              TeXLogParser                   │
│  - build CLI args            - regex pattern matching       │
│  - run latexmk               - extract file/line/message    │
│  - handle timeout            - categorize severity          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  DiagnosticsView             PDFPreviewView                 │
│  - render error list         - iframe PDF display           │
│  - click → navigate          - zoom controls                │
│  - show suggestions          - open external                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
obsidian-latex-compiler/
├── main.js              # Built plugin (31KB)
├── manifest.json        # Obsidian manifest
├── styles.css           # Plugin styles
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
│
├── src/
│   ├── main.ts          # Plugin entry point
│   ├── settings.ts      # Settings tab
│   ├── types.ts         # TypeScript interfaces
│   ├── constants.ts     # Constants & patterns
│   │
│   ├── compiler/
│   │   ├── CompilerBackend.ts      # Interface
│   │   ├── LatexmkBackend.ts       # latexmk implementation
│   │   └── CompileOrchestrator.ts  # Job queue
│   │
│   ├── parser/
│   │   ├── TeXLogParser.ts   # Log parsing engine
│   │   ├── patterns.ts       # Regex patterns
│   │   └── diagnostics.ts    # Helpers & suggestions
│   │
│   ├── project/
│   │   └── ProjectManager.ts # Project discovery/config
│   │
│   ├── views/
│   │   ├── DiagnosticsView.ts  # Error panel
│   │   ├── PDFPreviewView.ts   # PDF viewer
│   │   └── StatusBarItem.ts    # Status indicator
│   │
│   └── utils/
│       ├── platform.ts    # Cross-platform helpers
│       └── debounce.ts    # Debounce utility
│
└── test/
    ├── parser/
    │   ├── TeXLogParser.test.ts  # 12 unit tests
    │   └── fixtures/             # Sample .log files
    └── integration/
        └── sample-project/       # Test LaTeX project
```

---

## Roadmap

### Phase 2: Watch Mode ✅ COMPLETE

All tasks completed:
- [x] Add file watcher using vault events (avoids chokidar native module issues)
- [x] Implement debounced recompilation (500ms default)
- [x] "Watch LaTeX Project" command
- [x] "Stop Watching" command
- [x] Auto-refresh PDF on successful build
- [x] Status bar watch indicator

**Files created/modified:**
- `src/utils/fileWatcher.ts` - Vault-based file watching
- `src/main.ts` - Watch commands (lines 114-122, 424-534)
- `src/views/StatusBarItem.ts` - Watch indicator

---

### Phase 3: Per-Project Configuration ✅ COMPLETE

All tasks completed:
- [x] Support `.obsidian-latex.json` config file per project
- [x] Per-project engine selection
- [x] Per-project output directory
- [x] Per-project shell-escape setting
- [x] Detect and use `.latexmkrc` if present
- [ ] "LaTeX Projects" sidebar view (optional enhancement)

**Files created/modified:**
- `src/project/ProjectConfig.ts` - Config file loading/saving
- `src/project/ProjectManager.ts` - Project discovery with config support

---

### Phase 4: Extended Features

**Priority**: Low | **Complexity**: High

**Tasks:**
- [ ] Tectonic backend (alternative compiler)
- [ ] SyncTeX support (PDF↔source bidirectional navigation)
- [ ] Markdown-to-PDF via Pandoc (separate pipeline)
- [ ] Build on open (auto-compile when opening project)

---

## Key Interfaces

```typescript
// Core project configuration
interface LaTeXProjectConfig {
  rootPath: string;
  mainFile: string;
  engine: 'pdflatex' | 'xelatex' | 'lualatex';
  outputDir: string;
  shellEscape: boolean;
  extraLatexmkArgs: string[];
  latexmkrcPath?: string;
}

// Parsed diagnostic from logs
interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number | null;
  message: string;
  rawText: string;
  code?: string;
}

// Compilation result
interface BuildResult {
  success: boolean;
  pdfPath: string | null;
  diagnostics: Diagnostic[];
  logPath: string;
  durationMs: number;
}
```

---

## Log Parser Patterns

The `TeXLogParser` handles these error types:

| Pattern | Code | Example |
|---------|------|---------|
| Undefined control sequence | `UNDEFINED_CONTROL` | `\badcommand` |
| Missing package | `MISSING_FILE` | `fancyhdr.sty not found` |
| Undefined citation | `UNDEFINED_CITATION` | `Citation 'smith2023' undefined` |
| Undefined reference | `UNDEFINED_REFERENCE` | `Reference 'fig:1' undefined` |
| Package error | `PACKAGE_*_ERROR` | `Package babel Error` |
| Shell escape required | `SHELL_ESCAPE_REQUIRED` | minted package |
| Overfull hbox | `OVERFULL_HBOX` | Text too wide |
| Underfull hbox | `UNDERFULL_HBOX` | Text too sparse |

---

## CLI Commands Reference

```bash
# Basic compilation
latexmk -pdf -interaction=nonstopmode -outdir=.latex-out main.tex

# XeLaTeX
latexmk -pdfxe -interaction=nonstopmode -outdir=.latex-out main.tex

# LuaLaTeX
latexmk -pdflua -interaction=nonstopmode -outdir=.latex-out main.tex

# With shell-escape (minted, etc.)
latexmk -pdf -shell-escape -interaction=nonstopmode -outdir=.latex-out main.tex

# Clean
latexmk -C -outdir=.latex-out main.tex
```

---

## Installation (for testing)

1. Build: `npm install && npm run build`
2. Copy to vault:
   ```
   cp main.js manifest.json styles.css <vault>/.obsidian/plugins/latex-compiler/
   ```
3. Enable in Obsidian settings

---

## Contributing

### Running Tests
```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

### Building
```bash
npm run dev    # Development (watch mode)
npm run build  # Production build
```

### Adding New Error Patterns

1. Add regex to `src/parser/patterns.ts`
2. Add handler in `src/parser/TeXLogParser.ts`
3. Add suggestion in `src/parser/diagnostics.ts`
4. Add test fixture in `test/parser/fixtures/`
5. Add test case in `test/parser/TeXLogParser.test.ts`

---

## Known Issues / TODOs

- [ ] ProjectsView sidebar not implemented (enhancement)
- [x] ~~PDF preview uses iframe~~ - Working as intended
- [x] ~~File stack tracking in log parser is simplified~~ - Adequate for most cases
- [x] ~~No Windows testing yet~~ - PATH handling fixed for Windows
- [x] ~~Watch mode not implemented~~ - Implemented in FileWatcher.ts
- [x] ~~Per-project config not implemented~~ - Implemented in ProjectConfig.ts

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| obsidian | latest | Obsidian API |
| typescript | ^5.0.0 | TypeScript compiler |
| esbuild | ^0.19.0 | Bundler |
| jest | ^29.0.0 | Testing |
| ts-jest | ^29.0.0 | TypeScript Jest |

Note: `pdfjs-dist` was removed - PDF preview uses iframe which works well.
