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

  describe('PROJECT_CONFIG_FILE constant', () => {
    test('has expected value', () => {
      expect(PROJECT_CONFIG_FILE).toBe('.obsidian-latex.json');
    });
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

    test('returns null on other read errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

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

    test('validates pdflatex engine', async () => {
      const configContent = JSON.stringify({
        engine: 'pdflatex',
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.engine).toBe('pdflatex');
    });

    test('validates xelatex engine', async () => {
      const configContent = JSON.stringify({
        engine: 'xelatex',
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.engine).toBe('xelatex');
    });

    test('validates lualatex engine', async () => {
      const configContent = JSON.stringify({
        engine: 'lualatex',
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.engine).toBe('lualatex');
    });

    test('validates mainFile as string', async () => {
      const configContent = JSON.stringify({
        mainFile: 123,
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.mainFile).toBeUndefined();
    });

    test('validates outputDir as string', async () => {
      const configContent = JSON.stringify({
        outputDir: 'build',
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.outputDir).toBe('build');
    });

    test('validates shellEscape as boolean', async () => {
      const configContent = JSON.stringify({
        shellEscape: 'true',
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.shellEscape).toBeUndefined();
    });

    test('validates extraArgs as array of strings', async () => {
      const configContent = JSON.stringify({
        extraArgs: ['-verbose', '-halt-on-error'],
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.extraArgs).toEqual(['-verbose', '-halt-on-error']);
    });

    test('filters non-string items from extraArgs', async () => {
      const configContent = JSON.stringify({
        extraArgs: ['-verbose', 123, '-halt-on-error', null],
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.extraArgs).toEqual(['-verbose', '-halt-on-error']);
    });

    test('validates latexmkrc as string', async () => {
      const configContent = JSON.stringify({
        latexmkrc: './latexmkrc',
      });

      mockFs.readFile.mockResolvedValue(configContent);

      const config = await ProjectConfigLoader.loadConfig(testProjectPath);

      expect(config?.latexmkrc).toBe('./latexmkrc');
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

    test('saves config with proper JSON formatting', async () => {
      mockFs.writeFile.mockResolvedValue();

      const config = { mainFile: 'thesis.tex', engine: 'xelatex' as const };
      await ProjectConfigLoader.saveConfig(testProjectPath, config);

      const savedContent = mockFs.writeFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(savedContent);

      expect(parsed.mainFile).toBe('thesis.tex');
      expect(parsed.engine).toBe('xelatex');
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

    test('uses default mainFile when not in config', () => {
      const fileConfig = { engine: 'lualatex' as const };

      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        fileConfig,
        'default.tex'
      );

      expect(result.mainFile).toBe('default.tex');
    });

    test('uses default outputDir', () => {
      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        null,
        'main.tex'
      );

      expect(result.outputDir).toBe('.latex-out');
    });

    test('overrides outputDir from config', () => {
      const fileConfig = { outputDir: 'build' };

      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        fileConfig,
        'main.tex'
      );

      expect(result.outputDir).toBe('build');
    });

    test('defaults shellEscape to false', () => {
      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        null,
        'main.tex'
      );

      expect(result.shellEscape).toBe(false);
    });

    test('overrides shellEscape from config', () => {
      const fileConfig = { shellEscape: true };

      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        fileConfig,
        'main.tex'
      );

      expect(result.shellEscape).toBe(true);
    });

    test('defaults extraLatexmkArgs to empty array', () => {
      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        null,
        'main.tex'
      );

      expect(result.extraLatexmkArgs).toEqual([]);
    });

    test('uses extraArgs from config', () => {
      const fileConfig = { extraArgs: ['-verbose'] };

      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        fileConfig,
        'main.tex'
      );

      expect(result.extraLatexmkArgs).toEqual(['-verbose']);
    });

    test('sets latexmkrcPath from config', () => {
      const fileConfig = { latexmkrc: './custom.latexmkrc' };

      const result = ProjectConfigLoader.mergeWithDefaults(
        testProjectPath,
        fileConfig,
        'main.tex'
      );

      expect(result.latexmkrcPath).toBe('./custom.latexmkrc');
    });
  });

  describe('extractFileConfig', () => {
    test('extracts mainFile', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'thesis.tex',
        engine: 'pdflatex' as const,
        outputDir: '.latex-out',
        shellEscape: false,
        extraLatexmkArgs: [],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.mainFile).toBe('thesis.tex');
    });

    test('excludes default engine', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'pdflatex' as const,
        outputDir: '.latex-out',
        shellEscape: false,
        extraLatexmkArgs: [],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.engine).toBeUndefined();
    });

    test('includes non-default engine', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'xelatex' as const,
        outputDir: '.latex-out',
        shellEscape: false,
        extraLatexmkArgs: [],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.engine).toBe('xelatex');
    });

    test('excludes default outputDir', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'pdflatex' as const,
        outputDir: '.latex-out',
        shellEscape: false,
        extraLatexmkArgs: [],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.outputDir).toBeUndefined();
    });

    test('includes non-default outputDir', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'pdflatex' as const,
        outputDir: 'build',
        shellEscape: false,
        extraLatexmkArgs: [],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.outputDir).toBe('build');
    });

    test('excludes default shellEscape', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'pdflatex' as const,
        outputDir: '.latex-out',
        shellEscape: false,
        extraLatexmkArgs: [],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.shellEscape).toBeUndefined();
    });

    test('includes non-default shellEscape', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'pdflatex' as const,
        outputDir: '.latex-out',
        shellEscape: true,
        extraLatexmkArgs: [],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.shellEscape).toBe(true);
    });

    test('excludes empty extraLatexmkArgs', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'pdflatex' as const,
        outputDir: '.latex-out',
        shellEscape: false,
        extraLatexmkArgs: [],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.extraArgs).toBeUndefined();
    });

    test('includes non-empty extraLatexmkArgs', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'pdflatex' as const,
        outputDir: '.latex-out',
        shellEscape: false,
        extraLatexmkArgs: ['-verbose'],
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.extraArgs).toEqual(['-verbose']);
    });

    test('includes latexmkrcPath if present', () => {
      const config = {
        rootPath: testProjectPath,
        mainFile: 'main.tex',
        engine: 'pdflatex' as const,
        outputDir: '.latex-out',
        shellEscape: false,
        extraLatexmkArgs: [],
        latexmkrcPath: './custom.latexmkrc',
      };

      const result = ProjectConfigLoader.extractFileConfig(config);

      expect(result.latexmkrc).toBe('./custom.latexmkrc');
    });
  });
});
