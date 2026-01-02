import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import * as path from 'path';
import { TEX_PATHS } from '../constants';

const execAsync = promisify(exec);

/**
 * Get the current platform
 */
export function getPlatform(): 'darwin' | 'linux' | 'win32' {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
    return platform;
  }
  // Default to linux for other Unix-like systems
  return 'linux';
}

/**
 * Get the path separator for the current platform
 */
export function getPathSeparator(): string {
  return getPlatform() === 'win32' ? ';' : ':';
}

/**
 * Find a command in PATH or common installation directories
 */
export async function findCommand(command: string): Promise<string | null> {
  const platform = getPlatform();

  // Try 'which' or 'where' first
  const whichCmd = platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execAsync(`${whichCmd} ${command}`);
    const foundPath = stdout.trim().split('\n')[0];
    if (foundPath && existsSync(foundPath)) {
      return foundPath;
    }
  } catch {
    // Command not found in PATH, continue to check common locations
  }

  // Check common TeX installation paths
  const platformPaths = TEX_PATHS[platform] || [];
  for (const dir of platformPaths) {
    const fullPath = path.join(dir, platform === 'win32' ? `${command}.exe` : command);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Auto-detect TeX installation path
 * Returns the directory containing TeX binaries, or empty string if not found
 */
export async function autoDetectTexPath(): Promise<string> {
  const latexmkPath = await findCommand('latexmk');
  if (latexmkPath) {
    return path.dirname(latexmkPath);
  }

  // Also try to find pdflatex as a fallback
  const pdflatexPath = await findCommand('pdflatex');
  if (pdflatexPath) {
    return path.dirname(pdflatexPath);
  }

  return '';
}

/**
 * Check if latexmk is available
 */
export async function isLatexmkAvailable(customPath?: string): Promise<boolean> {
  const env = customPath ? { ...process.env, PATH: `${customPath}${getPathSeparator()}${process.env.PATH}` } : process.env;

  try {
    await execAsync('latexmk --version', { env });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get environment with custom TeX path prepended
 */
export function getEnvWithTexPath(customPath?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (customPath) {
    env.PATH = `${customPath}${getPathSeparator()}${env.PATH}`;
  }
  return env;
}

/**
 * Normalize a file path for the current platform
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * Quote a path for shell usage (handles spaces)
 */
export function quotePath(filePath: string): string {
  if (getPlatform() === 'win32') {
    // Windows: use double quotes
    return `"${filePath}"`;
  }
  // Unix: escape spaces or use quotes
  if (filePath.includes(' ')) {
    return `"${filePath}"`;
  }
  return filePath;
}
