import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream, existsSync } from 'fs';
import { spawn } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import { TECTONIC_DOWNLOADS, TECTONIC_VERSION } from '../constants';
import { getPlatform } from './platform';

/**
 * Download progress callback
 */
export type DownloadProgressCallback = (progress: {
  downloaded: number;
  total: number;
  percent: number;
}) => void;

/**
 * Result of Tectonic download/installation
 */
export interface TectonicInstallResult {
  success: boolean;
  binaryPath: string | null;
  error?: string;
  version?: string;
}

/**
 * Manages Tectonic binary download and installation
 */
export class TectonicDownloader {
  private pluginDir: string;
  private tectonicDir: string;

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
    this.tectonicDir = path.join(pluginDir, 'tectonic');
  }

  /**
   * Get the current platform and architecture
   */
  private getPlatformArch(): { platform: string; arch: string } {
    const platform = getPlatform();
    const rawArch = process.arch as string;

    // Normalize architecture names
    let arch: string;
    if (rawArch === 'x64' || rawArch === 'amd64') {
      arch = 'x64';
    } else if (rawArch === 'arm64' || rawArch === 'aarch64') {
      arch = 'arm64';
    } else {
      arch = rawArch;
    }

    return { platform, arch };
  }

  /**
   * Get the expected binary path for the current platform
   */
  getBinaryPath(): string {
    const { platform, arch } = this.getPlatformArch();
    const downloadInfo = TECTONIC_DOWNLOADS[platform]?.[arch];

    if (!downloadInfo) {
      throw new Error(`Unsupported platform: ${platform}-${arch}`);
    }

    return path.join(this.tectonicDir, downloadInfo.binary);
  }

  /**
   * Check if Tectonic is already installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      const binaryPath = this.getBinaryPath();
      await fs.access(binaryPath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the installed Tectonic version
   */
  async getInstalledVersion(): Promise<string | null> {
    try {
      const binaryPath = this.getBinaryPath();

      return new Promise((resolve) => {
        const proc = spawn(binaryPath, ['--version'], { shell: false });
        let output = '';

        proc.stdout?.on('data', (data: Buffer) => {
          output += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            // Parse version from output like "tectonic 0.15.0"
            const match = output.match(/tectonic\s+(\d+\.\d+\.\d+)/);
            resolve(match ? match[1] : null);
          } else {
            resolve(null);
          }
        });

        proc.on('error', () => resolve(null));
      });
    } catch {
      return null;
    }
  }

  /**
   * Check if an update is available
   */
  async isUpdateAvailable(): Promise<boolean> {
    const installedVersion = await this.getInstalledVersion();
    if (!installedVersion) return true;
    return installedVersion !== TECTONIC_VERSION;
  }

  /**
   * Download a file with progress reporting
   */
  private async downloadFile(
    url: string,
    destPath: string,
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const makeRequest = (requestUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }

        const protocol = requestUrl.startsWith('https') ? https : http;

        protocol.get(requestUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              makeRequest(redirectUrl, redirectCount + 1);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedSize = 0;

          const fileStream = createWriteStream(destPath);

          response.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length;
            if (onProgress && totalSize > 0) {
              onProgress({
                downloaded: downloadedSize,
                total: totalSize,
                percent: Math.round((downloadedSize / totalSize) * 100),
              });
            }
          });

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', (err) => {
            fs.unlink(destPath).catch(() => {});
            reject(err);
          });
        }).on('error', reject);
      };

      makeRequest(url);
    });
  }

  /**
   * Extract a tar.gz archive (Unix)
   */
  private async extractTarGz(archivePath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('tar', ['-xzf', archivePath, '-C', destDir], {
        shell: false,
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar extraction failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Extract a zip archive (Windows)
   */
  private async extractZip(archivePath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use PowerShell on Windows for zip extraction
      const proc = spawn('powershell', [
        '-Command',
        `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`
      ], { shell: false });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`zip extraction failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Download and install Tectonic
   */
  async install(onProgress?: DownloadProgressCallback): Promise<TectonicInstallResult> {
    const { platform, arch } = this.getPlatformArch();
    const downloadInfo = TECTONIC_DOWNLOADS[platform]?.[arch];

    if (!downloadInfo) {
      return {
        success: false,
        binaryPath: null,
        error: `Unsupported platform: ${platform}-${arch}. Tectonic binaries are available for macOS (x64/arm64), Linux (x64/arm64), and Windows (x64).`,
      };
    }

    try {
      // Ensure tectonic directory exists
      await fs.mkdir(this.tectonicDir, { recursive: true });

      // Determine archive extension
      const isZip = downloadInfo.url.endsWith('.zip');
      const archiveExt = isZip ? '.zip' : '.tar.gz';
      const archivePath = path.join(this.tectonicDir, `tectonic${archiveExt}`);

      // Download the archive
      console.log(`Downloading Tectonic from ${downloadInfo.url}`);
      await this.downloadFile(downloadInfo.url, archivePath, onProgress);

      // Extract the archive
      console.log('Extracting Tectonic...');
      if (isZip) {
        await this.extractZip(archivePath, this.tectonicDir);
      } else {
        await this.extractTarGz(archivePath, this.tectonicDir);
      }

      // Clean up archive
      await fs.unlink(archivePath).catch(() => {});

      // Get binary path and make executable (Unix)
      const binaryPath = path.join(this.tectonicDir, downloadInfo.binary);

      if (platform !== 'win32') {
        await fs.chmod(binaryPath, 0o755);
      }

      // Verify installation
      const version = await this.getInstalledVersion();

      if (!version) {
        return {
          success: false,
          binaryPath: null,
          error: 'Tectonic was downloaded but could not be executed. Please check permissions.',
        };
      }

      return {
        success: true,
        binaryPath,
        version,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        binaryPath: null,
        error: `Failed to install Tectonic: ${errorMessage}`,
      };
    }
  }

  /**
   * Uninstall Tectonic (remove downloaded binary)
   */
  async uninstall(): Promise<void> {
    try {
      await fs.rm(this.tectonicDir, { recursive: true, force: true });
    } catch {
      // Ignore errors during uninstall
    }
  }

  /**
   * Get download info for the current platform
   */
  getDownloadInfo(): { url: string; binary: string } | null {
    const { platform, arch } = this.getPlatformArch();
    return TECTONIC_DOWNLOADS[platform]?.[arch] || null;
  }

  /**
   * Check if the current platform is supported
   */
  isPlatformSupported(): boolean {
    return this.getDownloadInfo() !== null;
  }
}
