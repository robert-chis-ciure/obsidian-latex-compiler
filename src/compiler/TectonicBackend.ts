import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { CompilerBackend } from './CompilerBackend';
import { LaTeXProjectConfig, LaTeXPluginSettings, BuildResult, Diagnostic } from '../types';
import { TeXLogParser } from '../parser/TeXLogParser';
import { getPlatform } from '../utils/platform';
import { TectonicDownloader, DownloadProgressCallback } from '../utils/TectonicDownloader';

/**
 * Tectonic-based compiler backend
 * Self-contained TeX engine that downloads packages on-demand
 * No system TeX installation required
 */
export class TectonicBackend implements CompilerBackend {
  readonly name = 'tectonic';
  private currentProcess: ChildProcess | null = null;
  private settings: LaTeXPluginSettings;
  private downloader: TectonicDownloader;
  private pluginDir: string;

  constructor(settings: LaTeXPluginSettings, pluginDir: string) {
    this.settings = settings;
    this.pluginDir = pluginDir;
    this.downloader = new TectonicDownloader(pluginDir);
  }

  /**
   * Update settings (called when settings change)
   */
  updateSettings(settings: LaTeXPluginSettings): void {
    this.settings = settings;
  }

  /**
   * Get the path to the Tectonic binary
   */
  private getTectonicPath(): string {
    // Use custom path if provided
    if (this.settings.tectonicPath) {
      return this.settings.tectonicPath;
    }
    // Otherwise use the downloaded binary
    return this.downloader.getBinaryPath();
  }

  /**
   * Check if Tectonic is available (either installed or can be downloaded)
   */
  async isAvailable(): Promise<boolean> {
    // Check custom path first
    if (this.settings.tectonicPath) {
      return this.checkTectonicExecutable(this.settings.tectonicPath);
    }

    // Check if already downloaded
    if (await this.downloader.isInstalled()) {
      return true;
    }

    // Check if platform supports auto-download
    return this.downloader.isPlatformSupported();
  }

  /**
   * Check if a Tectonic executable exists and works
   */
  private async checkTectonicExecutable(binaryPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(binaryPath, ['--version'], { shell: false });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Ensure Tectonic is installed, downloading if necessary
   */
  async ensureInstalled(onProgress?: DownloadProgressCallback): Promise<{ success: boolean; error?: string }> {
    // Check custom path
    if (this.settings.tectonicPath) {
      const available = await this.checkTectonicExecutable(this.settings.tectonicPath);
      if (!available) {
        return {
          success: false,
          error: `Custom Tectonic path not valid: ${this.settings.tectonicPath}`,
        };
      }
      return { success: true };
    }

    // Check if already installed
    if (await this.downloader.isInstalled()) {
      return { success: true };
    }

    // Download and install
    const result = await this.downloader.install(onProgress);
    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Get the installed Tectonic version
   */
  async getVersion(): Promise<string | null> {
    if (this.settings.tectonicPath) {
      return this.getVersionFromBinary(this.settings.tectonicPath);
    }
    return this.downloader.getInstalledVersion();
  }

  /**
   * Get version from a specific binary path
   */
  private async getVersionFromBinary(binaryPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(binaryPath, ['--version'], { shell: false });
      let output = '';

      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          const match = output.match(/tectonic\s+(\d+\.\d+\.\d+)/);
          resolve(match ? match[1] : null);
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => resolve(null));
    });
  }

  /**
   * Compile a LaTeX project using Tectonic
   */
  async compile(
    project: LaTeXProjectConfig,
    onOutput: (chunk: string) => void
  ): Promise<BuildResult> {
    const startTime = Date.now();
    const outputDir = path.join(project.rootPath, project.outputDir);

    // Ensure Tectonic is installed
    const installResult = await this.ensureInstalled((progress) => {
      onOutput(`Downloading Tectonic: ${progress.percent}%\n`);
    });

    if (!installResult.success) {
      return {
        success: false,
        pdfPath: null,
        diagnostics: [{
          severity: 'error',
          file: project.mainFile,
          line: null,
          message: installResult.error || 'Failed to install Tectonic',
          rawText: '',
          code: 'TECTONIC_INSTALL_FAILED',
        }],
        logPath: '',
        durationMs: Date.now() - startTime,
      };
    }

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Build command arguments
    const args = this.buildArgs(project);
    const tectonicPath = this.getTectonicPath();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let cancelled = false;

      // Spawn Tectonic process
      this.currentProcess = spawn(tectonicPath, args, {
        cwd: project.rootPath,
        shell: false,
        detached: getPlatform() !== 'win32',
      });

      const proc = this.currentProcess;

      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        onOutput(chunk);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        onOutput(chunk);
      });

      proc.on('close', async (code) => {
        this.currentProcess = null;

        if (cancelled) {
          resolve({
            success: false,
            pdfPath: null,
            diagnostics: [{
              severity: 'info',
              file: project.mainFile,
              line: null,
              message: 'Compilation cancelled',
              rawText: '',
            }],
            logPath: '',
            durationMs: Date.now() - startTime,
          });
          return;
        }

        // Save combined build log
        const buildLogPath = path.join(outputDir, 'build.log');
        try {
          await fs.writeFile(buildLogPath, `${stdout}\n--- stderr ---\n${stderr}`);
        } catch {
          // Ignore write errors
        }

        // Parse diagnostics from Tectonic output
        // Tectonic outputs errors to stderr in a structured format
        const diagnostics = this.parseTectonicOutput(stdout + stderr, project);

        // Check for PDF output
        const mainBasename = path.basename(project.mainFile, '.tex');
        const pdfPath = path.join(outputDir, `${mainBasename}.pdf`);
        let pdfExists = false;
        try {
          await fs.access(pdfPath);
          pdfExists = true;
        } catch {
          pdfExists = false;
        }

        // If no PDF but no diagnostics, add a generic error
        if (!pdfExists && diagnostics.length === 0 && code !== 0) {
          diagnostics.push({
            severity: 'error',
            file: project.mainFile,
            line: null,
            message: 'Compilation failed - check build log for details',
            rawText: stderr || stdout.slice(-500),
          });
        }

        resolve({
          success: code === 0 && pdfExists,
          pdfPath: pdfExists ? pdfPath : null,
          diagnostics,
          logPath: buildLogPath,
          durationMs: Date.now() - startTime,
        });
      });

      proc.on('error', (error) => {
        this.currentProcess = null;
        resolve({
          success: false,
          pdfPath: null,
          diagnostics: [{
            severity: 'error',
            file: project.mainFile,
            line: null,
            message: `Failed to start Tectonic: ${error.message}`,
            rawText: error.stack || '',
            code: 'TECTONIC_NOT_FOUND',
          }],
          logPath: '',
          durationMs: Date.now() - startTime,
        });
      });

      // Set up timeout
      if (this.settings.compileTimeout > 0) {
        setTimeout(() => {
          if (this.currentProcess === proc) {
            cancelled = true;
            this.killProcessTree(proc);
          }
        }, this.settings.compileTimeout);
      }
    });
  }

  /**
   * Cancel current compilation
   */
  cancel(): void {
    if (this.currentProcess) {
      this.killProcessTree(this.currentProcess);
      this.currentProcess = null;
    }
  }

  /**
   * Clean build artifacts
   * Tectonic doesn't have a built-in clean command, so we manually remove files
   */
  async clean(project: LaTeXProjectConfig): Promise<{ success: boolean; message: string }> {
    const outputDir = path.join(project.rootPath, project.outputDir);

    try {
      // Check if output directory exists
      if (!existsSync(outputDir)) {
        return {
          success: true,
          message: 'No build artifacts to clean',
        };
      }

      // Remove the entire output directory
      await fs.rm(outputDir, { recursive: true, force: true });

      return {
        success: true,
        message: 'Build artifacts cleaned',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to clean: ${errorMessage}`,
      };
    }
  }

  /**
   * Build Tectonic command line arguments
   */
  private buildArgs(project: LaTeXProjectConfig): string[] {
    const args: string[] = [];

    // Output directory
    args.push('--outdir', project.outputDir);

    // Keep intermediate files for debugging
    args.push('--keep-intermediates');

    // Generate SyncTeX data
    args.push('--synctex');

    // Shell escape (if enabled)
    if (project.shellEscape) {
      args.push('--untrusted');
    }

    // Output format (Tectonic always produces PDF by default)
    args.push('--outfmt', 'pdf');

    // Tectonic automatically downloads packages - set bundle to use default web bundle
    // This is the key feature that makes Tectonic zero-install

    // Main file (must be last)
    args.push(project.mainFile);

    return args;
  }

  /**
   * Parse Tectonic output for diagnostics
   * Tectonic has its own error format mixed with TeX errors
   */
  private parseTectonicOutput(output: string, project: LaTeXProjectConfig): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = output.split('\n');

    // Patterns for Tectonic-specific errors
    const errorPattern = /^error: (.+)$/;
    const warningPattern = /^warning: (.+)$/;
    const texErrorPattern = /^! (.+)$/;
    const fileLinePattern = /^(.+\.tex):(\d+): (.+)$/;
    const lineNumberPattern = /^l\.(\d+) /;

    let currentFile = project.mainFile;
    let pendingError: string | null = null;
    let pendingLine: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Tectonic error format
      const errorMatch = line.match(errorPattern);
      if (errorMatch) {
        diagnostics.push({
          severity: 'error',
          file: currentFile,
          line: null,
          message: errorMatch[1],
          rawText: line,
          code: 'TECTONIC_ERROR',
        });
        continue;
      }

      // Tectonic warning format
      const warningMatch = line.match(warningPattern);
      if (warningMatch) {
        diagnostics.push({
          severity: 'warning',
          file: currentFile,
          line: null,
          message: warningMatch[1],
          rawText: line,
          code: 'TECTONIC_WARNING',
        });
        continue;
      }

      // File:line: error format
      const fileLineMatch = line.match(fileLinePattern);
      if (fileLineMatch) {
        const filePath = fileLineMatch[1];
        const lineNum = parseInt(fileLineMatch[2], 10);
        const message = fileLineMatch[3];

        diagnostics.push({
          severity: 'error',
          file: path.isAbsolute(filePath) ? filePath : path.join(project.rootPath, filePath),
          line: lineNum,
          message,
          rawText: line,
        });
        continue;
      }

      // Classic TeX error format
      const texErrorMatch = line.match(texErrorPattern);
      if (texErrorMatch) {
        pendingError = texErrorMatch[1];
        pendingLine = null;

        // Look for line number in following lines
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const lineNumMatch = lines[j].match(lineNumberPattern);
          if (lineNumMatch) {
            pendingLine = parseInt(lineNumMatch[1], 10);
            break;
          }
        }

        diagnostics.push({
          severity: 'error',
          file: currentFile,
          line: pendingLine,
          message: pendingError,
          rawText: line,
        });
        pendingError = null;
        pendingLine = null;
        continue;
      }

      // Track current file from TeX output
      const fileOpenMatch = line.match(/\(([^()]+\.tex)/);
      if (fileOpenMatch) {
        currentFile = fileOpenMatch[1];
        if (!path.isAbsolute(currentFile)) {
          currentFile = path.join(project.rootPath, currentFile);
        }
      }

      // Package not found
      if (line.includes('Package') && line.includes('not found')) {
        diagnostics.push({
          severity: 'error',
          file: currentFile,
          line: null,
          message: line.trim(),
          rawText: line,
          code: 'MISSING_PACKAGE',
        });
        continue;
      }

      // Undefined control sequence
      if (line.includes('Undefined control sequence')) {
        diagnostics.push({
          severity: 'error',
          file: currentFile,
          line: pendingLine,
          message: 'Undefined control sequence',
          rawText: line,
          code: 'UNDEFINED_COMMAND',
        });
        continue;
      }
    }

    return diagnostics;
  }

  /**
   * Kill process tree
   */
  private killProcessTree(proc: ChildProcess): void {
    if (!proc.pid) return;

    if (getPlatform() === 'win32') {
      spawn('taskkill', ['/pid', proc.pid.toString(), '/T', '/F'], {
        shell: false,
      });
    } else {
      try {
        process.kill(-proc.pid, 'SIGTERM');
        setTimeout(() => {
          try {
            process.kill(-proc.pid!, 'SIGKILL');
          } catch {
            // Process already dead
          }
        }, 3000);
      } catch {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }
    }
  }
}
