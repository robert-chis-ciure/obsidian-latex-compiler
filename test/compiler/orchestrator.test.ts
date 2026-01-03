import { CompileOrchestrator } from '../../src/compiler/CompileOrchestrator';
import { LaTeXProjectConfig, LaTeXPluginSettings, BuildResult, CompilerBackend } from '../../src/types';

const defaultSettings: LaTeXPluginSettings = {
  texPath: '',
  defaultEngine: 'pdflatex',
  defaultOutputDir: '.latex-out',
  shellEscape: false,
  showBadboxWarnings: false,
  compileTimeout: 120000,
  watchDebounce: 500,
  projects: [],
};

const mockProject: LaTeXProjectConfig = {
  rootPath: '/test/project',
  mainFile: 'main.tex',
  engine: 'pdflatex',
  outputDir: '.latex-out',
  shellEscape: false,
  extraLatexmkArgs: [],
};

const mockSuccessResult: BuildResult = {
  success: true,
  pdfPath: '/test/project/.latex-out/main.pdf',
  diagnostics: [],
  logPath: '/test/project/.latex-out/build.log',
  durationMs: 1000,
};

/**
 * Create a mock backend that implements CompilerBackend
 */
function createMockBackend(): CompilerBackend & {
  compile: jest.Mock;
  isAvailable: jest.Mock;
  cancel: jest.Mock;
} {
  return {
    name: 'mock-latexmk',
    compile: jest.fn().mockResolvedValue(mockSuccessResult),
    isAvailable: jest.fn().mockResolvedValue(true),
    cancel: jest.fn(),
  };
}

describe('CompileOrchestrator', () => {
  let orchestrator: CompileOrchestrator;
  let mockBackend: ReturnType<typeof createMockBackend>;

  beforeEach(() => {
    mockBackend = createMockBackend();
    orchestrator = new CompileOrchestrator(mockBackend);
  });

  afterEach(() => {
    orchestrator.cancelAll();
    jest.clearAllMocks();
  });

  describe('isBackendAvailable', () => {
    test('returns true when backend is available', async () => {
      const available = await orchestrator.isBackendAvailable();
      expect(available).toBe(true);
    });

    test('returns false when backend is unavailable', async () => {
      mockBackend.isAvailable.mockResolvedValue(false);
      const available = await orchestrator.isBackendAvailable();
      expect(available).toBe(false);
    });
  });

  describe('compile', () => {
    test('compiles a project successfully', async () => {
      const result = await orchestrator.compile(mockProject);

      expect(result.success).toBe(true);
      expect(mockBackend.compile).toHaveBeenCalledTimes(1);
    });

    test('returns correct build result', async () => {
      const result = await orchestrator.compile(mockProject);

      expect(result.pdfPath).toBe(mockSuccessResult.pdfPath);
      expect(result.logPath).toBe(mockSuccessResult.logPath);
      expect(result.diagnostics).toEqual(mockSuccessResult.diagnostics);
    });

    test('emits job:started event', async () => {
      const startedHandler = jest.fn();
      let statusAtStart: string = '';
      orchestrator.on('job:started', (job) => {
        startedHandler(job);
        statusAtStart = job.status;
      });

      await orchestrator.compile(mockProject);

      expect(startedHandler).toHaveBeenCalled();
      expect(startedHandler.mock.calls[0][0]).toHaveProperty('id');
      expect(startedHandler.mock.calls[0][0]).toHaveProperty('project');
      expect(statusAtStart).toBe('running');
    });

    test('emits job:completed event', async () => {
      const completedHandler = jest.fn();
      orchestrator.on('job:completed', completedHandler);

      await orchestrator.compile(mockProject);

      expect(completedHandler).toHaveBeenCalled();
      expect(completedHandler.mock.calls[0][0].result).toBe(mockSuccessResult);
    });

    test('handles compilation failure', async () => {
      mockBackend.compile.mockRejectedValue(new Error('Compilation failed'));

      const result = await orchestrator.compile(mockProject);

      expect(result.success).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0].severity).toBe('error');
    });

    test('includes error message in diagnostics on failure', async () => {
      mockBackend.compile.mockRejectedValue(new Error('Network timeout'));

      const result = await orchestrator.compile(mockProject);

      expect(result.diagnostics[0].message).toContain('Network timeout');
    });

    test('handles non-Error rejections', async () => {
      mockBackend.compile.mockRejectedValue('string error');

      const result = await orchestrator.compile(mockProject);

      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('string error');
    });

    test('passes project config to backend', async () => {
      await orchestrator.compile(mockProject);

      expect(mockBackend.compile).toHaveBeenCalledWith(
        mockProject,
        expect.any(Function)
      );
    });

    test('provides onOutput callback to backend', async () => {
      await orchestrator.compile(mockProject);

      const callArgs = mockBackend.compile.mock.calls[0];
      expect(typeof callArgs[1]).toBe('function');
    });
  });

  describe('cancelJob', () => {
    test('does nothing when job ID not found', async () => {
      await orchestrator.cancelJob('non-existent-id');
      expect(mockBackend.cancel).not.toHaveBeenCalled();
    });
  });

  describe('cancelAll', () => {
    test('can be called when no jobs are active', () => {
      // Should not throw
      expect(() => orchestrator.cancelAll()).not.toThrow();
    });
  });

  describe('isCompiling', () => {
    test('returns false when project is not compiling', () => {
      expect(orchestrator.isCompiling(mockProject.rootPath)).toBe(false);
    });

    test('returns false after compilation completes', async () => {
      await orchestrator.compile(mockProject);

      expect(orchestrator.isCompiling(mockProject.rootPath)).toBe(false);
    });
  });

  describe('getJob', () => {
    test('returns undefined for non-existent project', () => {
      const job = orchestrator.getJob('/non/existent/path');
      expect(job).toBeUndefined();
    });

    test('returns undefined after job completes', async () => {
      await orchestrator.compile(mockProject);

      const job = orchestrator.getJob(mockProject.rootPath);
      expect(job).toBeUndefined();
    });
  });

  describe('setBackend', () => {
    test('updates the compiler backend', async () => {
      const newBackend = createMockBackend();

      orchestrator.setBackend(newBackend);

      await orchestrator.compile(mockProject);

      expect(newBackend.compile).toHaveBeenCalled();
      expect(mockBackend.compile).not.toHaveBeenCalled();
    });
  });

  describe('job lifecycle', () => {
    test('failed job has status failed', async () => {
      mockBackend.compile.mockRejectedValue(new Error('fail'));

      let finalStatus: string = '';
      orchestrator.on('job:completed', (job) => { finalStatus = job.status; });

      await orchestrator.compile(mockProject);

      expect(finalStatus).toBe('failed');
    });

    test('successful job has status completed', async () => {
      let finalStatus: string = '';
      orchestrator.on('job:completed', (job) => { finalStatus = job.status; });

      await orchestrator.compile(mockProject);

      expect(finalStatus).toBe('completed');
    });

    test('job:started has running status', async () => {
      let startStatus: string = '';
      orchestrator.on('job:started', (job) => { startStatus = job.status; });

      await orchestrator.compile(mockProject);

      expect(startStatus).toBe('running');
    });
  });

  describe('job properties', () => {
    test('job has unique ID', async () => {
      const ids: string[] = [];
      orchestrator.on('job:started', (job) => { ids.push(job.id); });

      await orchestrator.compile(mockProject);
      await orchestrator.compile({ ...mockProject, rootPath: '/test/project2' });

      expect(ids[0]).not.toBe(ids[1]);
    });

    test('job includes project reference', async () => {
      let capturedJob: any;
      orchestrator.on('job:started', (job) => { capturedJob = job; });

      await orchestrator.compile(mockProject);

      expect(capturedJob.project).toEqual(mockProject);
    });

    test('job has startTime set', async () => {
      let startTime: number | undefined;
      orchestrator.on('job:started', (job) => { startTime = job.startTime; });

      const beforeCompile = Date.now();
      await orchestrator.compile(mockProject);

      expect(startTime).toBeDefined();
      expect(startTime).toBeGreaterThanOrEqual(beforeCompile);
    });
  });

  describe('output callback', () => {
    test('emits job:output events when backend sends output', async () => {
      const outputHandler = jest.fn();
      orchestrator.on('job:output', outputHandler);

      // Mock compile to call the onOutput callback
      mockBackend.compile.mockImplementation(async (project, onOutput) => {
        onOutput('Compiling...');
        onOutput('Done!');
        return mockSuccessResult;
      });

      await orchestrator.compile(mockProject);

      expect(outputHandler).toHaveBeenCalledTimes(2);
      expect(outputHandler.mock.calls[0][0].chunk).toBe('Compiling...');
      expect(outputHandler.mock.calls[1][0].chunk).toBe('Done!');
    });
  });

  describe('multiple projects', () => {
    test('can compile different projects sequentially', async () => {
      const project2 = { ...mockProject, rootPath: '/test/project2' };

      const result1 = await orchestrator.compile(mockProject);
      const result2 = await orchestrator.compile(project2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockBackend.compile).toHaveBeenCalledTimes(2);
    });

    test('returns false for both after sequential compiles complete', async () => {
      const project2 = { ...mockProject, rootPath: '/test/project2' };

      await orchestrator.compile(mockProject);
      await orchestrator.compile(project2);

      expect(orchestrator.isCompiling(mockProject.rootPath)).toBe(false);
      expect(orchestrator.isCompiling(project2.rootPath)).toBe(false);
    });
  });
});
