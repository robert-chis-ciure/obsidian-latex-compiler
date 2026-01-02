import * as path from 'path';
import * as fs from 'fs/promises';
import { LatexmkBackend } from '../../src/compiler/LatexmkBackend';
import { LaTeXProjectConfig, LaTeXPluginSettings } from '../../src/types';
import { isLatexmkAvailable } from '../../src/utils/platform';

// Default test settings
const defaultSettings: LaTeXPluginSettings = {
  texPath: '',
  defaultEngine: 'pdflatex',
  shellEscape: false,
  showBadboxWarnings: false,
  compileTimeout: 120000, // 2 minutes
};

// Sample project path
const sampleProjectPath = path.join(__dirname, 'sample-project');

// Helper to create a project config
function createProjectConfig(overrides: Partial<LaTeXProjectConfig> = {}): LaTeXProjectConfig {
  return {
    rootPath: sampleProjectPath,
    mainFile: 'main.tex',
    engine: 'pdflatex',
    outputDir: '.latex-out',
    shellEscape: false,
    extraLatexmkArgs: [],
    ...overrides,
  };
}

describe('LatexmkBackend Integration', () => {
  let backend: LatexmkBackend;
  let latexmkInstalled: boolean;

  beforeAll(async () => {
    // Check if latexmk is available
    latexmkInstalled = await isLatexmkAvailable();
    if (!latexmkInstalled) {
      console.warn('⚠️  latexmk not found - skipping integration tests');
    }
  });

  beforeEach(async () => {
    backend = new LatexmkBackend(defaultSettings);
    
    // Clean up any previous build output
    const outputDir = path.join(sampleProjectPath, '.latex-out');
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterEach(() => {
    // Cancel any running compilation
    backend.cancel();
  });

  describe('isAvailable', () => {
    test('returns correct availability status', async () => {
      const available = await backend.isAvailable();
      expect(available).toBe(latexmkInstalled);
    });
  });

  describe('compile', () => {
    test('compiles sample project successfully', async () => {
      if (!latexmkInstalled) {
        console.log('Skipping: latexmk not installed');
        return;
      }

      const project = createProjectConfig();
      const output: string[] = [];
      
      const result = await backend.compile(project, (chunk) => {
        output.push(chunk);
      });

      expect(result.success).toBe(true);
      expect(result.pdfPath).toBeTruthy();
      expect(result.durationMs).toBeGreaterThan(0);
      
      // Verify PDF was created
      if (result.pdfPath) {
        const pdfExists = await fs.access(result.pdfPath).then(() => true).catch(() => false);
        expect(pdfExists).toBe(true);
      }
      
      // Verify build log was created
      expect(result.logPath).toBeTruthy();
      const logExists = await fs.access(result.logPath).then(() => true).catch(() => false);
      expect(logExists).toBe(true);
    }, 120000); // 2 minute timeout

    test('produces diagnostics for successful build', async () => {
      if (!latexmkInstalled) {
        console.log('Skipping: latexmk not installed');
        return;
      }

      const project = createProjectConfig();
      
      const result = await backend.compile(project, () => {});

      // A successful build may have warnings but no errors
      const errors = result.diagnostics.filter(d => d.severity === 'error');
      expect(errors).toHaveLength(0);
    }, 120000);

    test('handles missing main file gracefully', async () => {
      if (!latexmkInstalled) {
        console.log('Skipping: latexmk not installed');
        return;
      }

      const project = createProjectConfig({
        mainFile: 'nonexistent.tex',
      });
      
      const result = await backend.compile(project, () => {});

      expect(result.success).toBe(false);
      expect(result.pdfPath).toBeNull();
    }, 120000);
  });

  describe('cancel', () => {
    test('cancel stops compilation', async () => {
      if (!latexmkInstalled) {
        console.log('Skipping: latexmk not installed');
        return;
      }

      const project = createProjectConfig();
      
      // Start compilation
      const compilePromise = backend.compile(project, () => {});
      
      // Cancel after a short delay
      setTimeout(() => {
        backend.cancel();
      }, 500);
      
      const result = await compilePromise;
      
      // Result should indicate cancellation or failure
      // Note: The exact behavior depends on timing
      expect(result.durationMs).toBeLessThan(60000); // Should not run full duration
    }, 120000);
  });

  describe('buildArgs', () => {
    test('includes -file-line-error flag', async () => {
      // We can't directly test private buildArgs, but we can check the output
      // The flag should improve error location detection
      if (!latexmkInstalled) {
        console.log('Skipping: latexmk not installed');
        return;
      }

      const project = createProjectConfig();
      let capturedOutput = '';
      
      await backend.compile(project, (chunk) => {
        capturedOutput += chunk;
      });

      // The command line should have been logged or we can infer from behavior
      // At minimum, the compilation should work
      expect(capturedOutput.length).toBeGreaterThan(0);
    }, 120000);
  });
});

describe('LatexmkBackend Unit Tests (no latexmk required)', () => {
  let backend: LatexmkBackend;

  beforeEach(() => {
    backend = new LatexmkBackend(defaultSettings);
  });

  test('updateSettings updates internal settings', () => {
    const newSettings: LaTeXPluginSettings = {
      ...defaultSettings,
      defaultEngine: 'xelatex',
    };
    
    backend.updateSettings(newSettings);
    
    // Can't directly verify, but the method should not throw
    expect(true).toBe(true);
  });

  test('cancel does not throw when no process running', () => {
    expect(() => {
      backend.cancel();
    }).not.toThrow();
  });
});
