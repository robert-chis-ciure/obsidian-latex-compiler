import { EventEmitter } from 'events';
import { CompilerBackend } from './CompilerBackend';
import { CompileJob, LaTeXProjectConfig, BuildResult, CompileOrchestratorEvents } from '../types';
import { TeXLogParser } from '../parser/TeXLogParser';

/**
 * Compilation job orchestrator
 * Manages a queue of compilation jobs and emits events for UI updates
 */
export class CompileOrchestrator extends EventEmitter {
  private backend: CompilerBackend;
  private activeJobs: Map<string, CompileJob> = new Map();
  private jobIdCounter = 0;

  constructor(backend: CompilerBackend) {
    super();
    this.backend = backend;
  }

  /**
   * Update the compiler backend
   */
  setBackend(backend: CompilerBackend): void {
    this.backend = backend;
  }

  /**
   * Compile a project
   * Cancels any existing job for the same project
   */
  async compile(project: LaTeXProjectConfig): Promise<BuildResult> {
    // Cancel any existing job for this project
    const existingJob = this.activeJobs.get(project.rootPath);
    if (existingJob) {
      await this.cancelJob(existingJob.id);
    }

    // Create new job
    const job: CompileJob = {
      id: `job-${++this.jobIdCounter}-${Date.now()}`,
      project,
      status: 'queued',
    };

    this.emit('job:queued', job);

    return this.executeJob(job);
  }

  /**
   * Execute a compilation job
   */
  private async executeJob(job: CompileJob): Promise<BuildResult> {
    job.status = 'running';
    job.startTime = Date.now();
    this.activeJobs.set(job.project.rootPath, job);
    this.emit('job:started', job);

    try {
      const result = await this.backend.compile(
        job.project,
        (chunk) => {
          this.emit('job:output', { jobId: job.id, chunk });
        }
      );

      job.status = 'completed';
      job.result = result;
      this.emit('job:completed', job);

      return result;

    } catch (error) {
      job.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);

      job.result = {
        success: false,
        pdfPath: null,
        diagnostics: [{
          severity: 'error',
          file: job.project.mainFile,
          line: null,
          message: `Compilation failed: ${errorMessage}`,
          rawText: error instanceof Error ? (error.stack || '') : '',
        }],
        logPath: '',
        durationMs: job.startTime ? Date.now() - job.startTime : 0,
      };

      this.emit('job:completed', job);
      return job.result;

    } finally {
      this.activeJobs.delete(job.project.rootPath);
    }
  }

  /**
   * Cancel a running job by ID
   */
  async cancelJob(jobId: string): Promise<void> {
    for (const [projectPath, job] of this.activeJobs) {
      if (job.id === jobId) {
        this.backend.cancel();
        job.status = 'cancelled';
        this.activeJobs.delete(projectPath);
        this.emit('job:cancelled', job);
        break;
      }
    }
  }

  /**
   * Cancel all running jobs
   */
  cancelAll(): void {
    for (const [projectPath, job] of this.activeJobs) {
      this.backend.cancel();
      job.status = 'cancelled';
      this.emit('job:cancelled', job);
    }
    this.activeJobs.clear();
  }

  /**
   * Check if a project is currently compiling
   */
  isCompiling(projectPath: string): boolean {
    const job = this.activeJobs.get(projectPath);
    return job?.status === 'running';
  }

  /**
   * Get current job for a project
   */
  getJob(projectPath: string): CompileJob | undefined {
    return this.activeJobs.get(projectPath);
  }

  /**
   * Check if backend is available
   */
  async isBackendAvailable(): Promise<boolean> {
    return this.backend.isAvailable();
  }
}

// Type augmentation for EventEmitter
export interface CompileOrchestrator {
  on<K extends keyof CompileOrchestratorEvents>(
    event: K,
    listener: CompileOrchestratorEvents[K]
  ): this;
  emit<K extends keyof CompileOrchestratorEvents>(
    event: K,
    ...args: Parameters<CompileOrchestratorEvents[K]>
  ): boolean;
}
