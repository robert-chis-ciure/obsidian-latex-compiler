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

    test('returns consistent value on multiple calls', () => {
      const platform1 = getPlatform();
      const platform2 = getPlatform();
      expect(platform1).toBe(platform2);
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

    test('returns a string', () => {
      const separator = getPathSeparator();
      expect(typeof separator).toBe('string');
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

    test('handles empty string', () => {
      const result = normalizePath('');
      expect(result).toBe('.');
    });

    test('handles relative paths', () => {
      const result = normalizePath('./relative/path');
      expect(result).toBe('relative/path');
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

    test('quotes all paths on Windows', () => {
      const platform = getPlatform();
      if (platform === 'win32') {
        const result = quotePath('/path/to/file.tex');
        expect(result).toBe('"/path/to/file.tex"');
      }
    });

    test('handles paths with multiple spaces', () => {
      const result = quotePath('/path/with many spaces/file name.tex');
      expect(result).toBe('"/path/with many spaces/file name.tex"');
    });

    test('handles empty string', () => {
      const platform = getPlatform();
      if (platform === 'win32') {
        const result = quotePath('');
        expect(result).toBe('""');
      } else {
        const result = quotePath('');
        expect(result).toBe('');
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

    test('returns unmodified env when empty string', () => {
      const env = getEnvWithTexPath('');
      expect(env.PATH).toBe(process.env.PATH);
    });

    test('preserves existing PATH', () => {
      const customPath = '/usr/local/texlive/bin';
      const originalPath = process.env.PATH;
      const env = getEnvWithTexPath(customPath);

      expect(env.PATH).toContain(originalPath || '');
    });

    test('returns a copy of process.env', () => {
      const env = getEnvWithTexPath();
      expect(env).not.toBe(process.env);
    });

    test('includes all existing environment variables', () => {
      const customPath = '/usr/local/texlive/bin';
      const env = getEnvWithTexPath(customPath);

      // Should have common env variables
      if (process.env.HOME) {
        expect(env.HOME).toBe(process.env.HOME);
      }
    });
  });
});
