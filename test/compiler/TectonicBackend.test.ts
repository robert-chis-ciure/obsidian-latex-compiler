// Mock modules before importing
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('fs');

import { TectonicBackend } from '../../src/compiler/TectonicBackend';
import { LaTeXProjectConfig, LaTeXPluginSettings } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

// Setup mocks
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

beforeEach(() => {
  jest.clearAllMocks();

  // Setup fs/promises mock
  (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
  (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
  (fs.access as jest.Mock).mockResolvedValue(undefined);
  (fs.rm as jest.Mock).mockResolvedValue(undefined);
  (fs.chmod as jest.Mock).mockResolvedValue(undefined);
  (fs.unlink as jest.Mock).mockResolvedValue(undefined);

  // Setup fs mock
  const mockFs = require('fs');
  mockFs.existsSync.mockReturnValue(true);
  mockFs.createWriteStream.mockReturnValue({
    on: jest.fn(),
    close: jest.fn(),
  });
});

// Mock TectonicDownloader
jest.mock('../../src/utils/TectonicDownloader', () => ({
  TectonicDownloader: jest.fn().mockImplementation(() => ({
    isInstalled: jest.fn().mockResolvedValue(true),
    getBinaryPath: jest.fn().mockReturnValue('/mock/tectonic'),
    getInstalledVersion: jest.fn().mockResolvedValue('0.15.0'),
    isPlatformSupported: jest.fn().mockReturnValue(true),
    install: jest.fn().mockResolvedValue({ success: true, binaryPath: '/mock/tectonic', version: '0.15.0' }),
  })),
}));

const defaultSettings: LaTeXPluginSettings = {
  texPath: '',
  compilerBackend: 'tectonic',
  tectonicPath: '',
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

describe('TectonicBackend', () => {
  let backend: TectonicBackend;
  const pluginDir = '/mock/plugin/dir';

  beforeEach(() => {
    backend = new TectonicBackend(defaultSettings, pluginDir);
  });

  describe('name', () => {
    test('returns "tectonic"', () => {
      expect(backend.name).toBe('tectonic');
    });
  });

  describe('isAvailable', () => {
    test('returns true when tectonic is installed', async () => {
      const result = await backend.isAvailable();
      expect(result).toBe(true);
    });

    test('returns true when custom tectonic path is set and valid', async () => {
      const customSettings = { ...defaultSettings, tectonicPath: '/custom/tectonic' };
      const customBackend = new TectonicBackend(customSettings, pluginDir);

      // Mock spawn for version check
      const mockProcess: any = {
        on: jest.fn((event, callback) => {
          if (event === 'close') setTimeout(() => callback(0), 0);
          return mockProcess;
        }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
      };
      mockSpawn.mockReturnValue(mockProcess);

      const result = await customBackend.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('updateSettings', () => {
    test('updates internal settings', () => {
      const newSettings = { ...defaultSettings, tectonicPath: '/new/path' };
      backend.updateSettings(newSettings);
      expect(backend).toBeDefined();
    });
  });

  describe('compile', () => {
    let mockProcess: any;

    beforeEach(() => {
      mockProcess = {
        pid: 12345,
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('Compiling...\n')), 5);
            }
          }),
        },
        stderr: {
          on: jest.fn(),
        },
        kill: jest.fn(),
      };
      mockSpawn.mockReturnValue(mockProcess);
      (fs.access as jest.Mock).mockResolvedValue(undefined);
    });

    test('compiles a project successfully', async () => {
      const onOutput = jest.fn();
      const result = await backend.compile(mockProject, onOutput);

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalled();
    });

    test('creates output directory before compilation', async () => {
      const onOutput = jest.fn();
      await backend.compile(mockProject, onOutput);

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(mockProject.rootPath, mockProject.outputDir),
        { recursive: true }
      );
    });

    test('passes correct arguments to tectonic', async () => {
      const onOutput = jest.fn();
      await backend.compile(mockProject, onOutput);

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args).toContain('--outdir');
      expect(args).toContain(mockProject.outputDir);
      expect(args).toContain('--keep-intermediates');
      expect(args).toContain('--synctex');
      expect(args).toContain('--outfmt');
      expect(args).toContain('pdf');
      expect(args).toContain(mockProject.mainFile);
    });

    test('includes --untrusted flag when shell-escape is enabled', async () => {
      const shellEscapeProject = { ...mockProject, shellEscape: true };
      const onOutput = jest.fn();
      await backend.compile(shellEscapeProject, onOutput);

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args).toContain('--untrusted');
    });

    test('saves build log to output directory', async () => {
      const onOutput = jest.fn();
      await backend.compile(mockProject, onOutput);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(mockProject.rootPath, mockProject.outputDir, 'build.log'),
        expect.any(String)
      );
    });

    test('returns failure when PDF is not generated', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('File not found'));

      const onOutput = jest.fn();
      const result = await backend.compile(mockProject, onOutput);

      expect(result.success).toBe(false);
    });

    test('returns correct PDF path on success', async () => {
      const onOutput = jest.fn();
      const result = await backend.compile(mockProject, onOutput);

      const expectedPdfPath = path.join(
        mockProject.rootPath,
        mockProject.outputDir,
        'main.pdf'
      );
      expect(result.pdfPath).toBe(expectedPdfPath);
    });

    test('returns durationMs in result', async () => {
      const onOutput = jest.fn();
      const result = await backend.compile(mockProject, onOutput);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('handles process spawn error', async () => {
      mockProcess.on = jest.fn((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Spawn failed')), 5);
        }
        return mockProcess;
      });

      const onOutput = jest.fn();
      const result = await backend.compile(mockProject, onOutput);

      expect(result.success).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0].code).toBe('TECTONIC_NOT_FOUND');
    });
  });

  describe('cancel', () => {
    test('can be called without error when no process is running', () => {
      expect(() => backend.cancel()).not.toThrow();
    });
  });

  describe('clean', () => {
    const mockFs = require('fs');

    test('removes output directory', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = await backend.clean(mockProject);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Build artifacts cleaned');
      expect(fs.rm).toHaveBeenCalledWith(
        path.join(mockProject.rootPath, mockProject.outputDir),
        { recursive: true, force: true }
      );
    });

    test('returns success when output directory does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await backend.clean(mockProject);

      expect(result.success).toBe(true);
      expect(result.message).toBe('No build artifacts to clean');
    });

    test('returns failure when rm throws an error', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (fs.rm as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      const result = await backend.clean(mockProject);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Permission denied');
    });
  });

  describe('getVersion', () => {
    test('returns installed version', async () => {
      const version = await backend.getVersion();
      expect(version).toBe('0.15.0');
    });
  });
});

describe('TectonicBackend integration', () => {
  test('implements CompilerBackend interface', () => {
    const backend = new TectonicBackend(defaultSettings, '/mock/dir');

    expect(typeof backend.name).toBe('string');
    expect(typeof backend.isAvailable).toBe('function');
    expect(typeof backend.compile).toBe('function');
    expect(typeof backend.cancel).toBe('function');
    expect(typeof backend.clean).toBe('function');
  });
});
