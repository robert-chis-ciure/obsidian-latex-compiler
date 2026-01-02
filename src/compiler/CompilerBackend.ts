import { LaTeXProjectConfig, BuildResult } from '../types';

/**
 * Abstract interface for compiler backends
 * Allows for multiple compilation strategies (latexmk, tectonic, etc.)
 */
export interface CompilerBackend {
  /** Backend identifier name */
  readonly name: string;

  /**
   * Check if this backend is available on the system
   */
  isAvailable(): Promise<boolean>;

  /**
   * Compile a LaTeX project
   * @param project Project configuration
   * @param onOutput Callback for streaming output
   * @returns Build result with diagnostics
   */
  compile(
    project: LaTeXProjectConfig,
    onOutput: (chunk: string) => void
  ): Promise<BuildResult>;

  /**
   * Cancel the current compilation
   */
  cancel(): void;

  /**
   * Clean build artifacts
   * @param project Project configuration
   * @returns Result with success status and message
   */
  clean(project: LaTeXProjectConfig): Promise<{ success: boolean; message: string }>;
}
