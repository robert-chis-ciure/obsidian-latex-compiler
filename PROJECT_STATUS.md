# Obsidian LaTeX Compiler - Project Status

**Last Updated:** January 2025
**Version:** 0.2.0 (with Tectonic support)

## Project Vision

An Obsidian plugin that combines the best of Overleaf, Zotero, and Obsidian to create a seamless academic writing experience for LaTeX users. The goal is to enable LaTeX compilation directly within Obsidian without requiring external tools or complex setup.

---

## Current State

### Implemented Features

#### Phase 0: Core LaTeX Compilation ✅
- Multi-file LaTeX project support with latexmk backend
- Three TeX engines: pdflatex, xelatex, lualatex
- Shell-escape support with security warnings
- Custom latexmkrc file support
- Automatic PDF verification after compilation
- Cross-platform support (macOS, Linux, Windows)

#### Phase 1: Zero-Install LaTeX Engine ✅ (Just Completed)
- **Tectonic Backend**: Self-contained TeX engine, no system installation required
- **Automatic Download**: Downloads Tectonic binary (~30MB) on first use
- **Platform Support**: macOS (x64/arm64), Linux (x64/arm64), Windows (x64)
- **Backend Selection**: Choose between Tectonic (recommended) and latexmk in settings
- **Custom Path**: Option to use a custom Tectonic installation

#### Diagnostics & Error Reporting ✅
- Structured error/warning parsing with 20+ error patterns
- Helpful suggestions for common issues
- Undefined references/citations detection
- BibTeX/Biber error handling
- Badbox warnings (overfull/underfull boxes)

#### User Interface ✅
- **PDF Preview**: In-editor PDF viewing with zoom controls (50%-300%)
- **Diagnostics Panel**: Right-sidebar showing errors with clickable navigation
- **Projects Panel**: Left-sidebar listing all projects with compile/watch controls
- **Status Bar**: Shows build status with error/warning counts

#### Watch Mode ✅
- File change detection using Obsidian's vault events
- Debounced auto-recompilation (configurable delay)
- Visual status indicator for watching state
- Watches .tex, .bib, .cls, .sty, .bst files

#### Project Management ✅
- Auto-discovery of LaTeX folders with entrypoints
- Per-project configuration files (`.obsidian-latex.json`)
- Configuration modal for engine, output directory, shell-escape
- Project registry stored in plugin settings

---

## Architecture Overview

```
obsidian-latex-compiler/
├── src/
│   ├── main.ts                    # Plugin entry point
│   ├── types.ts                   # TypeScript types and interfaces
│   ├── constants.ts               # Configuration constants
│   ├── settings.ts                # Settings UI tab
│   ├── compiler/
│   │   ├── CompilerBackend.ts     # Backend interface
│   │   ├── LatexmkBackend.ts      # latexmk implementation
│   │   ├── TectonicBackend.ts     # Tectonic implementation (NEW)
│   │   └── CompileOrchestrator.ts # Job queue management
│   ├── parser/
│   │   ├── TeXLogParser.ts        # Log file parser
│   │   ├── patterns.ts            # Regex patterns for errors
│   │   └── diagnostics.ts         # Diagnostic enhancement
│   ├── project/
│   │   ├── ProjectManager.ts      # Project discovery & management
│   │   └── ProjectConfig.ts       # Per-project config loader
│   ├── views/
│   │   ├── DiagnosticsView.ts     # Error panel
│   │   ├── PDFPreviewView.ts      # PDF viewer
│   │   ├── ProjectsView.ts        # Project list
│   │   └── StatusBarItem.ts       # Status bar widget
│   └── utils/
│       ├── platform.ts            # Cross-platform utilities
│       ├── fileWatcher.ts         # File change detection
│       ├── debounce.ts            # Debounce utility
│       └── TectonicDownloader.ts  # Binary download manager (NEW)
└── test/
    ├── compiler/
    │   ├── orchestrator.test.ts
    │   └── TectonicBackend.test.ts (NEW)
    ├── parser/
    │   └── TeXLogParser.test.ts
    ├── utils/
    │   ├── platform.test.ts
    │   └── TectonicDownloader.test.ts (NEW)
    └── integration/
        └── compile.test.ts
```

---

## Next Steps (Roadmap)

### Phase 2: Zotero + Pandoc Integration (High Priority)

**Goal:** Enable academic citation workflow directly in Obsidian.

**Tasks:**
1. **BibTeX Integration**
   - Auto-detect `.bib` files in project
   - Citation key autocomplete from `.bib` files
   - Live citation preview on hover

2. **Pandoc Pipeline** (Optional but powerful)
   - Convert Markdown → LaTeX → PDF
   - Support Pandoc's `--citeproc` for citations
   - YAML frontmatter for metadata

3. **Zotero Integration**
   - Detect Better BibTeX auto-export location
   - Watch `.bib` file for citation updates
   - Citation picker modal with fuzzy search

**Estimated Scope:** ~400-600 lines of new code

---

### Phase 3: Overleaf-like Experience (Medium Priority)

**Goal:** Rich editing features for a seamless writing experience.

**Tasks:**
1. **SyncTeX Forward/Reverse Search**
   - Click PDF → jump to `.tex` source line
   - Click source → highlight PDF location
   - (SyncTeX files already generated, just needs UI)

2. **LaTeX Autocomplete**
   - `\begin{...}` environment completion
   - `\cite{...}` citation completion from `.bib`
   - `\ref{...}` label completion
   - Common command snippets

3. **Template System**
   - Built-in templates (article, report, thesis, beamer)
   - Custom template folder support

**Estimated Scope:** ~600-800 lines of new code

---

### Phase 4: Polish & Publishing (Low Priority)

**Goal:** Ready for community release.

**Tasks:**
- Community plugin submission to Obsidian
- Documentation website
- Settings migration for updates
- Error recovery improvements
- Accessibility audit

---

## Technical Decisions

### Why Tectonic as Default?
1. **Zero-Install**: No TeX Live/MacTeX installation required
2. **Modern**: Based on XeTeX with excellent Unicode support
3. **Small**: ~30MB binary vs multi-GB TeX distributions
4. **Fast**: Downloads packages on-demand, caches them locally
5. **Cross-Platform**: Official binaries for all major platforms

### Backend Selection Strategy
- **New users**: Tectonic (default) - works out of the box
- **Power users**: latexmk - for complex builds with custom packages

### Security Considerations
- Shell-escape disabled by default with explicit warning
- No command injection via `spawn()` with `shell: false`
- Process groups for clean subprocess termination
- Mobile platform detection (desktop-only plugin)

---

## Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| CompileOrchestrator | 52 | ✅ Pass |
| TeXLogParser | 45 | ✅ Pass |
| TectonicBackend | 25 | ✅ Pass |
| TectonicDownloader | 12 | ✅ Pass |
| ProjectConfig | 24 | ✅ Pass |
| Platform Utils | 15 | ✅ Pass |
| E2E/Integration | 9 | ✅ Pass (skipped without TeX) |
| **Total** | **182** | **All Passing** |

---

## How to Contribute

1. Clone the repository
2. Run `npm install`
3. Run `npm run dev` for development build with watch mode
4. Run `npm test` to verify tests pass
5. Create a PR with your changes

---

## License

MIT License - See LICENSE file for details.
