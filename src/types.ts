import { ChildProcess } from 'child_process';

/**
 * TeX engine options
 */
export type TeXEngine = 'pdflatex' | 'xelatex' | 'lualatex';

/**
 * Compiler backend options
 */
export type CompilerBackendType = 'latexmk' | 'tectonic';

/**
 * Diagnostic severity levels
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Compilation job status
 */
export type JobStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';

/**
 * Per-project LaTeX configuration
 */
export interface LaTeXProjectConfig {
  /** Absolute path to project folder */
  rootPath: string;
  /** Relative path to entrypoint, e.g., "main.tex" */
  mainFile: string;
  /** TeX engine to use */
  engine: TeXEngine;
  /** Relative output directory, default ".latex-out" */
  outputDir: string;
  /** Enable -shell-escape (security risk!) */
  shellEscape: boolean;
  /** Additional latexmk arguments */
  extraLatexmkArgs: string[];
  /** Optional path to custom latexmkrc */
  latexmkrcPath?: string;
}

/**
 * Plugin-wide settings
 */
export interface LaTeXPluginSettings {
  /** Custom path to TeX binaries (empty = auto-detect) */
  texPath: string;
  /** Compiler backend to use */
  compilerBackend: CompilerBackendType;
  /** Custom path to Tectonic binary (empty = use bundled/downloaded) */
  tectonicPath: string;
  /** Default TeX engine for new projects */
  defaultEngine: TeXEngine;
  /** Default output directory for new projects */
  defaultOutputDir: string;
  /** Global shell-escape setting (can be overridden per project) */
  shellEscape: boolean;
  /** Watch mode debounce in milliseconds */
  watchDebounce: number;
  /** Compilation timeout in milliseconds */
  compileTimeout: number;
  /** Show badbox warnings (overfull/underfull) */
  showBadboxWarnings: boolean;
  /** Registered projects */
  projects: LaTeXProjectConfig[];
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: LaTeXPluginSettings = {
  texPath: '',
  compilerBackend: 'tectonic', // Default to Tectonic for zero-install experience
  tectonicPath: '',
  defaultEngine: 'pdflatex',
  defaultOutputDir: '.latex-out',
  shellEscape: false,
  watchDebounce: 500,
  compileTimeout: 300000, // 5 minutes
  showBadboxWarnings: false,
  projects: [],
};

/**
 * Structured diagnostic from log parsing
 */
export interface Diagnostic {
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Absolute path to source file */
  file: string;
  /** Line number (1-indexed), null if unknown */
  line: number | null;
  /** Column number, if available */
  column?: number;
  /** Short error message */
  message: string;
  /** Original log excerpt for context */
  rawText: string;
  /** Error code if parseable (e.g., "MISSING_PACKAGE") */
  code?: string;
}

/**
 * Result of a compilation
 */
export interface BuildResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** Path to generated PDF, null if failed */
  pdfPath: string | null;
  /** Parsed diagnostics */
  diagnostics: Diagnostic[];
  /** Path to build log */
  logPath: string;
  /** Compilation duration in milliseconds */
  durationMs: number;
}

/**
 * Compilation job queue entry
 */
export interface CompileJob {
  /** Unique job identifier */
  id: string;
  /** Project configuration */
  project: LaTeXProjectConfig;
  /** Current job status */
  status: JobStatus;
  /** Job start timestamp */
  startTime?: number;
  /** Child process handle */
  process?: ChildProcess;
  /** Build result (set when completed) */
  result?: BuildResult;
  /** Resolve callback for queued jobs */
  resolve?: (result: BuildResult) => void;
}

/**
 * Compiler backend interface for extensibility
 */
export interface CompilerBackend {
  /** Backend name */
  name: string;
  /** Check if this backend is available */
  isAvailable(): Promise<boolean>;
  /** Compile a project */
  compile(
    project: LaTeXProjectConfig,
    onOutput: (chunk: string) => void
  ): Promise<BuildResult>;
  /** Cancel current compilation */
  cancel(): void;
}

/**
 * Events emitted by the compile orchestrator
 */
export interface CompileOrchestratorEvents {
  'job:queued': (job: CompileJob) => void;
  'job:started': (job: CompileJob) => void;
  'job:output': (data: { jobId: string; chunk: string }) => void;
  'job:completed': (job: CompileJob) => void;
  'job:cancelled': (job: CompileJob) => void;
}
