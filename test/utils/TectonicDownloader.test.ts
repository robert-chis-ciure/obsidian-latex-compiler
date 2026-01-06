// Test only the constants and interface - avoid complex mocking issues
import { TECTONIC_VERSION, TECTONIC_DOWNLOADS } from '../../src/constants';

describe('TECTONIC_DOWNLOADS constants', () => {
  test('has darwin downloads for x64 and arm64', () => {
    expect(TECTONIC_DOWNLOADS.darwin.x64).toBeDefined();
    expect(TECTONIC_DOWNLOADS.darwin.arm64).toBeDefined();
  });

  test('has linux downloads for x64 and arm64', () => {
    expect(TECTONIC_DOWNLOADS.linux.x64).toBeDefined();
    expect(TECTONIC_DOWNLOADS.linux.arm64).toBeDefined();
  });

  test('has win32 downloads for x64', () => {
    expect(TECTONIC_DOWNLOADS.win32.x64).toBeDefined();
  });

  test('darwin downloads use tar.gz format', () => {
    expect(TECTONIC_DOWNLOADS.darwin.x64.url).toContain('.tar.gz');
    expect(TECTONIC_DOWNLOADS.darwin.arm64.url).toContain('.tar.gz');
  });

  test('linux downloads use tar.gz format', () => {
    expect(TECTONIC_DOWNLOADS.linux.x64.url).toContain('.tar.gz');
  });

  test('win32 downloads use zip format', () => {
    expect(TECTONIC_DOWNLOADS.win32.x64.url).toContain('.zip');
  });

  test('win32 binary has .exe extension', () => {
    expect(TECTONIC_DOWNLOADS.win32.x64.binary).toBe('tectonic.exe');
  });

  test('unix binaries do not have .exe extension', () => {
    expect(TECTONIC_DOWNLOADS.darwin.x64.binary).toBe('tectonic');
    expect(TECTONIC_DOWNLOADS.linux.x64.binary).toBe('tectonic');
  });

  test('download URLs contain correct version', () => {
    expect(TECTONIC_DOWNLOADS.darwin.x64.url).toContain(TECTONIC_VERSION);
    expect(TECTONIC_DOWNLOADS.darwin.arm64.url).toContain(TECTONIC_VERSION);
    expect(TECTONIC_DOWNLOADS.linux.x64.url).toContain(TECTONIC_VERSION);
    expect(TECTONIC_DOWNLOADS.win32.x64.url).toContain(TECTONIC_VERSION);
  });

  test('download URLs point to GitHub releases', () => {
    expect(TECTONIC_DOWNLOADS.darwin.x64.url).toContain('github.com/tectonic-typesetting/tectonic');
  });

  test('version is a valid semver', () => {
    expect(TECTONIC_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('TectonicDownloader class structure', () => {
  // Import dynamically to avoid module-level mock issues
  test('TectonicDownloader can be imported', async () => {
    const { TectonicDownloader } = await import('../../src/utils/TectonicDownloader');
    expect(TectonicDownloader).toBeDefined();
    expect(typeof TectonicDownloader).toBe('function');
  });

  test('TectonicDownloader instance has required methods', async () => {
    const { TectonicDownloader } = await import('../../src/utils/TectonicDownloader');
    const downloader = new TectonicDownloader('/test/plugin/dir');

    expect(typeof downloader.isInstalled).toBe('function');
    expect(typeof downloader.getInstalledVersion).toBe('function');
    expect(typeof downloader.isUpdateAvailable).toBe('function');
    expect(typeof downloader.install).toBe('function');
    expect(typeof downloader.uninstall).toBe('function');
    expect(typeof downloader.getDownloadInfo).toBe('function');
    expect(typeof downloader.isPlatformSupported).toBe('function');
  });
});
