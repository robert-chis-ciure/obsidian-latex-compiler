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
  private projectQueues: Map<string, CompileJob[]> = new Map();
  private activeJobCount = 0;
  private maxConcurrent = 2; // Allow 2 concurrent compilations across projects

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
   * Queues the job if project already has an active compilation or concurrent limit reached
   */
  async compile(project: LaTeXProjectConfig): Promise<BuildResult> {
    // Create job
    const job: CompileJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      project,
      status: 'queued',
      startTime: Date.now(),
    };

    // Check if this project already has an active job
    const existingJob = this.getActiveJobForProject(project.rootPath);

    if (existingJob) {
      // Queue this job instead of canceling existing
      this.queueJob(project.rootPath, job);
      this.emit('job:queued', job);

      // Return a promise that resolves when this queued job completes
      return new Promise((resolve) => {
        job.resolve = resolve;
      });
    }

    // Check concurrent limit
    if (this.activeJobCount >= this.maxConcurrent) {
      // Queue and wait for a slot
      this.queueJob(project.rootPath, job);
      this.emit('job:queued', job);

      return new Promise((resolve) => {
        job.resolve = resolve;
      });
    }

    // Start immediately
    return this.startJob(job);
  }

  /**
   * Queue a job for a project
   */
  private queueJob(projectPath: string, job: CompileJob): void {
    const queue = this.projectQueues.get(projectPath) || [];
    queue.push(job);
    this.projectQueues.set(projectPath, queue);
  }

  /**
   * Get the active job for a project (if any)
   */
  private getActiveJobForProject(projectPath: string): CompileJob | undefined {
    for (const job of this.activeJobs.values()) {
      if (job.project.rootPath === projectPath && job.status === 'running') {
        return job;
      }
    }
    return undefined;
  }

  /**
   * Start a compilation job
   */
  private async startJob(job: CompileJob): Promise<BuildResult> {
    job.status = 'running';
    this.activeJobs.set(job.id, job);
    this.activeJobCount++;

    this.emit('job:started', job);

    try {
      const result = await this.backend.compile(job.project, (output) => {
        this.emit('job:output', { jobId: job.id, chunk: output });
      });

      job.status = 'completed';
      job.result = result;

      return result;
    } catch (error) {
      job.status = 'failed';
      const errorResult: BuildResult = {
        success: false,
        pdfPath: null,
        diagnostics: [{
          severity: 'error',
          file: job.project.mainFile,
          line: null,
          message: `Compilation error: ${error}`,
          rawText: '',
        }],
        logPath: '',
        durationMs: Date.now() - (job.startTime || Date.now()),
      };
      job.result = errorResult;
      return errorResult;
    } finally {
      this.activeJobs.delete(job.id);
      this.activeJobCount--;

      this.emit('job:completed', job);

      // Process next queued job for this project
      this.processNextQueuedJob(job.project.rootPath);

      // Also check global queue for other projects waiting for a slot
      this.processGlobalQueue();
    }
  }

  /**
   * Process the next queued job for a specific project
   */
  private processNextQueuedJob(projectPath: string): void {
    const queue = this.projectQueues.get(projectPath);
    if (!queue || queue.length === 0) return;

    // Only start if no active job for this project
    if (this.getActiveJobForProject(projectPath)) return;

    const nextJob = queue.shift()!;
    if (queue.length === 0) {
      this.projectQueues.delete(projectPath);
    }

    // Start the job and resolve its promise
    this.startJob(nextJob).then((result) => {
      nextJob.resolve?.(result);
    });
  }

  /**
   * Process global queue - check all projects for waiting jobs
   */
  private processGlobalQueue(): void {
    if (this.activeJobCount >= this.maxConcurrent) return;

    for (const [projectPath, queue] of this.projectQueues) {
      // Skip if project already has active job
      if (this.getActiveJobForProject(projectPath)) continue;

      if (queue.length > 0) {
        const nextJob = queue.shift()!;
        if (queue.length === 0) {
          this.projectQueues.delete(projectPath);
        }

        this.startJob(nextJob).then((result) => {
          nextJob.resolve?.(result);
        });

        // Check if we've hit the limit
        if (this.activeJobCount >= this.maxConcurrent) break;
      }
    }
  }

  /**
   * Cancel a running job by ID
   */
  async cancelJob(jobId: string): Promise<void> {
    for (const [key, job] of this.activeJobs) {
      if (job.id === jobId) {
        this.backend.cancel();
        job.status = 'cancelled';
        this.activeJobs.delete(key);
        this.activeJobCount--;
        this.emit('job:cancelled', job);
        break;
      }
    }
  }

  /**
   * Cancel all running jobs and queued jobs
   */
  cancelAll(): void {
    // Cancel active jobs
    for (const job of this.activeJobs.values()) {
      this.backend.cancel();
      job.status = 'cancelled';
      this.emit('job:cancelled', job);
    }
    this.activeJobs.clear();
    this.activeJobCount = 0;

    // Cancel all queued jobs
    for (const [projectPath] of this.projectQueues) {
      this.cancelQueuedJobs(projectPath);
    }
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

  /**
   * Get queued jobs for a project
   */
  getQueuedJobs(projectPath: string): CompileJob[] {
    return this.projectQueues.get(projectPath) || [];
  }

  /**
   * Get all queued jobs across all projects
   */
  getAllQueuedJobs(): CompileJob[] {
    const allJobs: CompileJob[] = [];
    for (const queue of this.projectQueues.values()) {
      allJobs.push(...queue);
    }
    return allJobs;
  }

  /**
   * Cancel all queued (not active) jobs for a project
   */
  cancelQueuedJobs(projectPath: string): number {
    const queue = this.projectQueues.get(projectPath);
    if (!queue) return 0;

    const count = queue.length;

    // Reject all queued job promises
    for (const job of queue) {
      job.status = 'cancelled';
      job.resolve?.({
        success: false,
        pdfPath: null,
        diagnostics: [{
          severity: 'info',
          file: job.project.mainFile,
          line: null,
          message: 'Compilation cancelled (removed from queue)',
          rawText: '',
        }],
        logPath: '',
        durationMs: 0,
      });
      this.emit('job:cancelled', job);
    }

    this.projectQueues.delete(projectPath);
    return count;
  }

  /**
   * Get the current queue depth for a project
   */
  getQueueDepth(projectPath: string): number {
    return this.projectQueues.get(projectPath)?.length || 0;
  }

  /**
   * Set the maximum concurrent compilations
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, max);
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
