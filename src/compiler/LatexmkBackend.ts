import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { CompilerBackend } from './CompilerBackend';
import { LaTeXProjectConfig, LaTeXPluginSettings, BuildResult, Diagnostic } from '../types';
import { TeXLogParser } from '../parser/TeXLogParser';
import { getEnvWithTexPath, getPlatform } from '../utils/platform';

/**
 * Latexmk-based compiler backend
 * Primary backend that provides Overleaf-compatible compilation
 */
export class LatexmkBackend implements CompilerBackend {
  readonly name = 'latexmk';
  private currentProcess: ChildProcess | null = null;
  private settings: LaTeXPluginSettings;

  constructor(settings: LaTeXPluginSettings) {
    this.settings = settings;
  }

  /**
   * Update settings (called when settings change)
   */
  updateSettings(settings: LaTeXPluginSettings): void {
    this.settings = settings;
  }

  /**
   * Check if latexmk is available
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('latexmk', ['--version'], {
        shell: false,
        env: getEnvWithTexPath(this.settings.texPath),
      });

      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Compile a LaTeX project using latexmk
   */
  async compile(
    project: LaTeXProjectConfig,
    onOutput: (chunk: string) => void
  ): Promise<BuildResult> {
    const startTime = Date.now();
    const outputDir = path.join(project.rootPath, project.outputDir);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Build command arguments
    const args = this.buildArgs(project);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let cancelled = false;

      // Use shell: false for security (no command injection)
      // Use detached: true to create a process group for proper cleanup
      this.currentProcess = spawn('latexmk', args, {
        cwd: project.rootPath,
        shell: false,
        detached: getPlatform() !== 'win32', // Process groups work differently on Windows
        env: getEnvWithTexPath(this.settings.texPath),
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
        } catch (e) {
          // Ignore write errors
        }

        // Parse TeX log for diagnostics
        const mainBasename = path.basename(project.mainFile, '.tex');
        const texLogPath = path.join(outputDir, `${mainBasename}.log`);

        let diagnostics: Diagnostic[] = [];
        try {
          const texLog = await fs.readFile(texLogPath, 'utf-8');
          const parser = new TeXLogParser({
            showBadboxWarnings: this.settings.showBadboxWarnings,
          });
          diagnostics = parser.parse(texLog, project.rootPath);
        } catch {
          // Log file might not exist if compilation failed early
          // Try to extract what we can from stdout/stderr
          if (code !== 0) {
            diagnostics.push({
              severity: 'error',
              file: project.mainFile,
              line: null,
              message: 'Compilation failed - check build log for details',
              rawText: stderr || stdout.slice(-500),
            });
          }
        }

        // Check for PDF output
        const pdfPath = path.join(outputDir, `${mainBasename}.pdf`);
        let pdfExists = false;
        try {
          await fs.access(pdfPath);
          pdfExists = true;
        } catch {
          pdfExists = false;
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
            message: `Failed to start latexmk: ${error.message}`,
            rawText: error.stack || '',
            code: 'LATEXMK_NOT_FOUND',
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
   * Clean build artifacts using latexmk -C
   */
  async clean(project: LaTeXProjectConfig): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const args = [
        '-C',                             // Clean all generated files
        `-outdir=${project.outputDir}`,   // Output directory
        project.mainFile,                 // Main file
      ];

      const proc = spawn('latexmk', args, {
        cwd: project.rootPath,
        shell: false,
        env: getEnvWithTexPath(this.settings.texPath),
      });

      let output = '';
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      proc.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          message: code === 0 ? 'Build artifacts cleaned' : `Clean failed: ${output}`,
        });
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          message: `Failed to run latexmk -C: ${error.message}`,
        });
      });
    });
  }

  /**
   * Build latexmk command line arguments
   * Note: With shell: false, paths don't need quoting - they're passed directly
   */
  private buildArgs(project: LaTeXProjectConfig): string[] {
    const args: string[] = [
      '-pdf',                           // Generate PDF output
      '-interaction=nonstopmode',       // Don't stop on errors
      '-file-line-error',               // Better error locations for parser
      '-synctex=1',                     // Generate SyncTeX data for PDF↔source sync
      `-outdir=${project.outputDir}`,   // Output directory
    ];

    // Engine selection
    switch (project.engine) {
      case 'xelatex':
        args.push('-pdfxe');
        break;
      case 'lualatex':
        args.push('-pdflua');
        break;
      case 'pdflatex':
      default:
        // pdflatex is the default, no special flag needed
        break;
    }

    // Shell escape (dangerous!)
    if (project.shellEscape) {
      args.push('-shell-escape');
    }

    // Custom latexmkrc
    if (project.latexmkrcPath) {
      args.push('-r', project.latexmkrcPath);
    }

    // Extra arguments
    if (project.extraLatexmkArgs.length > 0) {
      args.push(...project.extraLatexmkArgs);
    }

    // Main file (must be last)
    args.push(project.mainFile);

    return args;
  }

  /**
   * Kill process tree (latexmk spawns child TeX processes)
   */
  private killProcessTree(proc: ChildProcess): void {
    if (!proc.pid) return;

    if (getPlatform() === 'win32') {
      // Windows: use taskkill to kill process tree
      spawn('taskkill', ['/pid', proc.pid.toString(), '/T', '/F'], {
        shell: false,
      });
    } else {
      // Unix: kill the process group (negative PID)
      try {
        process.kill(-proc.pid, 'SIGTERM');
        // SIGKILL fallback after 3 seconds if still running
        setTimeout(() => {
          try {
            process.kill(-proc.pid!, 'SIGKILL');
          } catch {
            // Process already dead, ignore
          }
        }, 3000);
      } catch {
        // Process already dead or no permission, try direct kill
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }
    }
  }
}
