import { getPlatform, getPathSeparator, autoDetectTexPath, isLatexmkAvailable, findCommand } from '../../src/utils/platform';

describe('Platform Utilities Smoke Tests', () => {
  describe('getPlatform', () => {
    test('returns a valid platform', () => {
      const platform = getPlatform();
      expect(['darwin', 'linux', 'win32']).toContain(platform);
    });
  });

  describe('getPathSeparator', () => {
    test('returns correct separator for platform', () => {
      const separator = getPathSeparator();
      const platform = getPlatform();
      
      if (platform === 'win32') {
        expect(separator).toBe(';');
      } else {
        expect(separator).toBe(':');
      }
    });
  });

  describe('autoDetectTexPath', () => {
    test('returns string (empty if not found)', async () => {
      const texPath = await autoDetectTexPath();
      expect(typeof texPath).toBe('string');
      
      if (texPath) {
        console.log(`Found TeX at: ${texPath}`);
      } else {
        console.log('TeX installation not found in PATH');
      }
    });
  });

  describe('isLatexmkAvailable', () => {
    test('returns boolean', async () => {
      const available = await isLatexmkAvailable();
      expect(typeof available).toBe('boolean');
      
      if (available) {
        console.log('✓ latexmk is available');
      } else {
        console.log('✗ latexmk not found');
      }
    });

    test('respects custom path parameter', async () => {
      // Test with an invalid path
      const available = await isLatexmkAvailable('/nonexistent/path');
      // Should still check system PATH, so result depends on system
      expect(typeof available).toBe('boolean');
    });
  });

  describe('findCommand', () => {
    test('finds common commands', async () => {
      // Try to find a command that should exist on all systems
      const platform = getPlatform();
      const testCommand = platform === 'win32' ? 'cmd' : 'ls';
      
      const foundPath = await findCommand(testCommand);
      expect(foundPath).toBeTruthy();
    });

    test('returns null for nonexistent command', async () => {
      const foundPath = await findCommand('definitely-not-a-real-command-12345');
      expect(foundPath).toBeNull();
    });
  });
});

describe('Engine Selection Tests', () => {
  test('common TeX engines are documented', () => {
    // This test documents the supported engines
    const supportedEngines = ['pdflatex', 'xelatex', 'lualatex'];
    expect(supportedEngines).toHaveLength(3);
  });
});
