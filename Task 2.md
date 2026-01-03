# Task 2: Queue Semantics Improvement

> **Priority**: Medium | **Estimated Complexity**: Medium
> **Independence**: This task modifies only `CompileOrchestrator.ts` and has no overlap with other tasks.

## Objective

Improve the compilation orchestrator to support per-project serial queues instead of canceling previous jobs, while allowing concurrent compilation across different projects.

## Files to Modify

- `src/compiler/CompileOrchestrator.ts`

---

## Current Behavior

When a new compile is requested for a project that already has an active compilation, the current implementation **cancels** the existing job and starts the new one.

## New Behavior

- Maintain a **queue per project**
- New compile requests for the same project **wait in queue**
- Allow **concurrent compilation** across different projects (with configurable limit)
- Provide option to **cancel all queued jobs** for a project
- Emit `job:queued` event when a job is queued instead of started immediately

---

## Implementation Requirements

### 1. Read the existing file first

Read `src/compiler/CompileOrchestrator.ts` to understand the current implementation.

### 2. Add new properties to the class

```typescript
// Add to class properties
private projectQueues: Map<string, CompileJob[]> = new Map();
private activeJobCount = 0;
private maxConcurrent = 2; // Allow 2 concurrent compilations across projects
```

### 3. Add `job:queued` event type

Update the EventEmitter types if TypeScript strict mode requires it:

```typescript
// Events emitted:
// - 'job:queued' - when a job is added to the queue
// - 'job:started' - when a job begins compilation
// - 'job:completed' - when a job finishes
// - 'job:cancelled' - when a job is cancelled
```

### 4. Modify `compile()` method

Replace the current cancellation logic with queue logic:

```typescript
async compile(project: LaTeXProjectConfig): Promise<BuildResult> {
  // Create job
  const job: CompileJob = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    project,
    status: 'pending',
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
```

### 5. Add helper methods

```typescript
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
      this.emit('job:output', { job, output });
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
      durationMs: Date.now() - job.startTime,
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
```

### 6. Add new public methods

```typescript
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
```

### 7. Update the CompileJob type

In `src/types.ts`, add a resolve callback to CompileJob:

```typescript
export interface CompileJob {
  id: string;
  project: LaTeXProjectConfig;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  result?: BuildResult;
  resolve?: (result: BuildResult) => void; // For queued jobs
}
```

---

## Backward Compatibility

The existing API should continue to work:
- `compile()` still returns `Promise<BuildResult>`
- `cancelJob()` still cancels active jobs
- `cancelAll()` should now also clear all queues

Update `cancelAll()`:

```typescript
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
```

---

## Acceptance Criteria

- [ ] Queued jobs wait for current job to complete before starting
- [ ] Multiple projects can compile concurrently (up to maxConcurrent limit)
- [ ] `job:queued` event is emitted when a job is queued
- [ ] `getQueuedJobs()` returns correct queue for a project
- [ ] `cancelQueuedJobs()` cancels only queued (not active) jobs
- [ ] `cancelAll()` cancels both active and queued jobs
- [ ] Existing compile/cancel behavior works unchanged for single job scenarios
- [ ] No TypeScript errors when building

---

## Testing

1. Build the plugin: `npm run build`
2. Test single project: Compile should work as before
3. Test queue: Start a compile, immediately start another on same project - second should queue
4. Test concurrent: Compile two different projects simultaneously
5. Test cancel: Cancel a queued job and verify it doesn't run
6. Test stress: Queue multiple jobs and verify they process in order
