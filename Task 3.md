# Task 3: Test Coverage Expansion

> **Priority**: Medium | **Estimated Complexity**: Medium
> **Independence**: This task creates/modifies only test files and has no overlap with other tasks.

## Objective

Expand test coverage with additional unit tests, integration tests, and edge case coverage for modules that currently lack tests.

## Files to Create

- `test/compiler/orchestrator.test.ts`
- `test/utils/platform.test.ts`
- `test/project/ProjectManager.test.ts`
- `test/project/ProjectConfig.test.ts`

## Files to Modify

- `test/parser/TeXLogParser.test.ts` (expand with additional tests)

---

## Implementation Requirements

### 1. Create `test/compiler/orchestrator.test.ts`

```typescript
import { CompileOrchestrator } from '../../src/compiler/CompileOrchestrator';
import { LatexmkBackend } from '../../src/compiler/LatexmkBackend';
import { LaTeXProjectConfig, LaTeXPluginSettings, BuildResult } from '../../src/types';

// Mock the backend
jest.mock('../../src/compiler/LatexmkBackend');

const defaultSettings: LaTeXPluginSettings = {
  texPath: '',
  defaultEngine: 'pdflatex',
  defaultOutputDir: '.latex-out',
  shellEscape: false,
  showBadboxWarnings: false,
  compileTimeout: 120000,
  watchDebounce: 500,
  projects: [],
};

const mockProject: LaTeXProjectConfig = {
  rootPath: '/test/project',
  mainFile: 'main.tex',
  engine: 'pdflatex',
  outputDir: '.latex-out',
  shellEscape: false,
  extraLatexmkArgs: [],
};

const mockSuccessResult: BuildResult = {
  success: true,
  pdfPath: '/test/project/.latex-out/main.pdf',
  diagnostics: [],
  logPath: '/test/project/.latex-out/build.log',
  durationMs: 1000,
};

describe('CompileOrchestrator', () => {
  let orchestrator: CompileOrchestrator;
  let mockBackend: jest.Mocked<LatexmkBackend>;

  beforeEach(() => {
    mockBackend = new LatexmkBackend(defaultSettings) as jest.Mocked<LatexmkBackend>;
    mockBackend.compile = jest.fn().mockResolvedValue(mockSuccessResult);
    mockBackend.isAvailable = jest.fn().mockResolvedValue(true);
    mockBackend.cancel = jest.fn();

    orchestrator = new CompileOrchestrator(mockBackend);
  });

  afterEach(() => {
    orchestrator.cancelAll();
    jest.clearAllMocks();
  });

  describe('isBackendAvailable', () => {
    test('returns true when backend is available', async () => {
      const available = await orchestrator.isBackendAvailable();
      expect(available).toBe(true);
    });

    test('returns false when backend is unavailable', async () => {
      mockBackend.isAvailable.mockResolvedValue(false);
      const available = await orchestrator.isBackendAvailable();
      expect(available).toBe(false);
    });
  });

  describe('compile', () => {
    test('compiles a project successfully', async () => {
      const result = await orchestrator.compile(mockProject);

      expect(result.success).toBe(true);
      expect(mockBackend.compile).toHaveBeenCalledTimes(1);
    });

    test('emits job:started event', async () => {
      const startedHandler = jest.fn();
      orchestrator.on('job:started', startedHandler);

      await orchestrator.compile(mockProject);

      expect(startedHandler).toHaveBeenCalled();
    });

    test('emits job:completed event', async () => {
      const completedHandler = jest.fn();
      orchestrator.on('job:completed', completedHandler);

      await orchestrator.compile(mockProject);

      expect(completedHandler).toHaveBeenCalled();
      expect(completedHandler.mock.calls[0][0].result).toBe(mockSuccessResult);
    });
  });

  describe('cancelJob', () => {
    test('cancels an active job', async () => {
      // Start a slow compilation
      mockBackend.compile.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(mockSuccessResult), 5000);
        });
      });

      const compilePromise = orchestrator.compile(mockProject);

      // Get the job ID
      const jobs = orchestrator.getActiveJobs();
      expect(jobs.length).toBe(1);

      // Cancel it
      orchestrator.cancelJob(jobs[0].id);

      expect(mockBackend.cancel).toHaveBeenCalled();
    });
  });

  describe('cancelAll', () => {
    test('cancels all active jobs', async () => {
      mockBackend.compile.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(mockSuccessResult), 5000);
        });
      });

      // Start multiple compilations (different projects)
      const project2 = { ...mockProject, rootPath: '/test/project2' };
      orchestrator.compile(mockProject);
      orchestrator.compile(project2);

      expect(orchestrator.getActiveJobs().length).toBeGreaterThan(0);

      orchestrator.cancelAll();

      // Should emit cancelled events
      expect(mockBackend.cancel).toHaveBeenCalled();
    });
  });
});
```

### 2. Create `test/utils/platform.test.ts`

```typescript
import {
  getPlatform,
  getPathSeparator,
  normalizePath,
  quotePath,
  getEnvWithTexPath,
} from '../../src/utils/platform';

describe('Platform Utilities', () => {
  describe('getPlatform', () => {
    test('returns a valid platform string', () => {
      const platform = getPlatform();
      expect(['darwin', 'linux', 'win32']).toContain(platform);
    });
  });

  describe('getPathSeparator', () => {
    test('returns correct separator for current platform', () => {
      const separator = getPathSeparator();
      const platform = getPlatform();

      if (platform === 'win32') {
        expect(separator).toBe(';');
      } else {
        expect(separator).toBe(':');
      }
    });
  });

  describe('normalizePath', () => {
    test('normalizes path separators', () => {
      const result = normalizePath('/path/to/file');
      expect(result).toBe('/path/to/file');
    });

    test('handles double slashes', () => {
      const result = normalizePath('/path//to//file');
      expect(result).toBe('/path/to/file');
    });

    test('resolves . and ..', () => {
      const result = normalizePath('/path/./to/../file');
      expect(result).toBe('/path/file');
    });
  });

  describe('quotePath', () => {
    test('quotes paths with spaces', () => {
      const result = quotePath('/path/with spaces/file.tex');
      expect(result).toBe('"/path/with spaces/file.tex"');
    });

    test('does not quote paths without spaces on Unix', () => {
      const platform = getPlatform();
      if (platform !== 'win32') {
        const result = quotePath('/path/to/file.tex');
        expect(result).toBe('/path/to/file.tex');
      }
    });
  });

  describe('getEnvWithTexPath', () => {
    test('prepends custom tex path to PATH', () => {
      const customPath = '/usr/local/texlive/bin';
      const env = getEnvWithTexPath(customPath);

      expect(env.PATH).toBeDefined();
      expect(env.PATH!.startsWith(customPath)).toBe(true);
    });

    test('uses correct separator', () => {
      const customPath = '/usr/local/texlive/bin';
      const env = getEnvWithTexPath(customPath);
      const separator = getPathSeparator();

      expect(env.PATH).toContain(separator);
    });

    test('returns unmodified env when no custom path', () => {
      const env = getEnvWithTexPath();
      expect(env.PATH).toBe(process.env.PATH);
    });
  });
});
```

### 3. Create `test/project/ProjectConfig.test.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectConfigLoader, PROJECT_CONFIG_FILE } from '../../src/project/ProjectConfig';

// Mock fs
jest.mock('fs/promises');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockFsSync = require('fs') as jest.Mocked<typeof import('fs')>;

describe('ProjectConfigLoader', () => {
  const testProjectPath = '/test/project';
  const configPath = path.join(testProjectPath, PROJECT_CONFIG_FILE);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasConfigFile', () => {
    test('returns true when config file exists', () => {
      mockFsSync.existsSync.mockReturnValue(true);

      expect(ProjectConfigLoader.hasConfigFile(testProjectPath)).toBe(true);
      expect(mockFsSync.existsSync).toHaveBeenCalledWith(configPath);
    });

    test('returns false when config file does not exist', () => {
      mockFsSync.existsSync.mockReturnValue(false);

      expect(ProjectConfigLoader.hasConfigFile(testProjectPath)).toBe(false);
    });
  });

  describe('loadConfig', () => {
    test('loads and parses valid config file', async () => {
      const configContent = JSON.stringify({
        mainFile: 'thesis.tex',
        engine: 'xelatex',
        shellEscape: true,
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config).not.toBeNull();
      expect(config?.mainFile).toBe('thesis.tex');
      expect(config?.engine).toBe('xelatex');
      expect(config?.shellEscape).toBe(true);
    });

    test('returns null when file does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config).toBeNull();
    });

    test('validates engine values', async () => {
      const configContent = JSON.stringify({
        engine: 'invalid-engine',
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.engine).toBeUndefined(); // Invalid value filtered out
    });
  });

  describe('saveConfig', () => {
    test('saves config to file', async () => {
      mockFs.writeFile.mockResolvedValue();

      const config = { mainFile: 'thesis.tex' };
      const result = await ProjectConfigLoader.saveConfig(testProjectPath, config);

      expect(result).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        configPath,
        expect.any(String),
        'utf-8'
      );
    });

    test('returns false on write error', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      const config = { mainFile: 'thesis.tex' };
      const result = await ProjectConfigLoader.saveConfig(testProjectPath, config);

      expect(result).toBe(false);
    });
  });

  describe('mergeWithDefaults', () => {
    test('merges file config with defaults', () => {
      const fileConfig = { mainFile: 'thesis.tex', engine: 'xelatex' as const };

      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        fileConfig,
        'main.tex'
      );

      expect(result.rootPath).toBe(testProjectPath);
      expect(result.mainFile).toBe('thesis.tex'); // From file config
      expect(result.engine).toBe('xelatex'); // From file config
      expect(result.outputDir).toBe('.latex-out'); // Default
    });

    test('uses defaults when no file config', () => {
      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        null,
        'main.tex'
      );

      expect(result.mainFile).toBe('main.tex');
      expect(result.engine).toBe('pdflatex');
    });
  });
});
```

### 4. Expand `test/parser/TeXLogParser.test.ts`

Add these additional tests to the existing file:

```typescript
// Add to existing TeXLogParser.test.ts

describe('BibTeX/Biber pattern parsing', () => {
  test('parses BibTeX citation not found warning', () => {
    const log = `Warning--I didn't find a database entry for "smith2023"`;

    const parser = new TeXLogParser();
    const diagnostics = parser.parse(log, '/project');

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].code).toBe('BIBTEX_CITATION_NOT_FOUND');
    expect(diagnostics[0].message).toContain('smith2023');
  });

  test('parses BibTeX missing field warning', () => {
    const log = `Warning--empty year in jones2020`;

    const parser = new TeXLogParser();
    const diagnostics = parser.parse(log, '/project');

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].code).toBe('BIBTEX_MISSING_FIELD');
    expect(diagnostics[0].message).toContain('year');
    expect(diagnostics[0].message).toContain('jones2020');
  });

  test('parses Biber error', () => {
    const log = `ERROR - Cannot find 'references.bib'`;

    const parser = new TeXLogParser();
    const diagnostics = parser.parse(log, '/project');

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].code).toBe('BIBER_ERROR');
  });

  test('parses Biber warning', () => {
    const log = `WARN - Duplicate entry key 'smith2023' in file 'refs.bib'`;

    const parser = new TeXLogParser();
    const diagnostics = parser.parse(log, '/project');

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].code).toBe('BIBER_WARNING');
  });
});

describe('FILE_LINE_ERROR format parsing', () => {
  test('parses file:line:error format', () => {
    const log = `./chapter1.tex:15: Undefined control sequence.`;

    const parser = new TeXLogParser();
    const diagnostics = parser.parse(log, '/project');

    expect(diagnostics.length).toBeGreaterThan(0);
    const fileLineError = diagnostics.find(d => d.code === 'FILE_LINE_ERROR');
    expect(fileLineError).toBeDefined();
    expect(fileLineError?.line).toBe(15);
  });

  test('resolves relative paths in file:line:error', () => {
    const log = `./chapter1.tex:15: Missing $ inserted.`;

    const parser = new TeXLogParser();
    const diagnostics = parser.parse(log, '/project');

    const error = diagnostics.find(d => d.code === 'FILE_LINE_ERROR');
    expect(error?.file).toContain('chapter1.tex');
  });
});

describe('Graceful fallback behavior', () => {
  test('returns raw log on parse failure', () => {
    // Create a parser and force an error by mocking
    const parser = new TeXLogParser();

    // Test with completely invalid/empty content still produces something
    const diagnostics = parser.parse('', '/project');
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  test('handles malformed log gracefully', () => {
    const malformedLog = `
      ((((((((((
      Random garbage that doesn't match any pattern
      ))))))))))
    `;

    const parser = new TeXLogParser();
    const diagnostics = parser.parse(malformedLog, '/project');

    // Should not throw, should return empty or minimal diagnostics
    expect(Array.isArray(diagnostics)).toBe(true);
  });
});

describe('Edge cases', () => {
  test('handles empty log', () => {
    const parser = new TeXLogParser();
    const diagnostics = parser.parse('', '/project');

    expect(Array.isArray(diagnostics)).toBe(true);
    expect(diagnostics.length).toBe(0);
  });

  test('handles log with only whitespace', () => {
    const parser = new TeXLogParser();
    const diagnostics = parser.parse('   \n\n\t\t   ', '/project');

    expect(Array.isArray(diagnostics)).toBe(true);
  });

  test('handles very long log files', () => {
    const longLog = '! Error\n'.repeat(1000);

    const parser = new TeXLogParser();
    const diagnostics = parser.parse(longLog, '/project');

    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
```

---

## Test Fixtures (Optional)

Create additional fixture files in `test/parser/fixtures/`:

### `bibtex-citation-missing.log`
```
This is BibTeX, Version 0.99d
Warning--I didn't find a database entry for "smith2023"
Warning--I didn't find a database entry for "jones2024"
(There were 2 warnings)
```

### `biber-error.log`
```
INFO - This is Biber 2.17
INFO - Looking for biber source files in 'main.bcf'...
ERROR - Cannot find 'references.bib'!
FATAL - Cannot find 'references.bib'!
```

---

## Acceptance Criteria

- [ ] All new tests pass: `npm test`
- [ ] No regression in existing tests (12 parser tests still pass)
- [ ] Test coverage improved for:
  - [ ] CompileOrchestrator
  - [ ] Platform utilities
  - [ ] ProjectConfig
  - [ ] BibTeX/Biber patterns
  - [ ] FILE_LINE_ERROR format
  - [ ] Edge cases
- [ ] Tests are documented with clear describe/test blocks
- [ ] Mock setup is clean and reusable

---

## Testing

1. Run all tests: `npm test`
2. Run with coverage: `npm test -- --coverage`
3. Run specific test file: `npm test -- orchestrator.test.ts`
4. Verify no regressions: All 12 existing parser tests still pass
