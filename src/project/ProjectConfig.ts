import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { LaTeXProjectConfig, TeXEngine, DEFAULT_SETTINGS } from '../types';

/**
 * Config file name for per-project settings
 */
export const PROJECT_CONFIG_FILE = '.obsidian-latex.json';

/**
 * Per-project configuration file schema
 */
export interface ProjectConfigFile {
  /** Main entry file (relative to project root) */
  mainFile?: string;
  /** TeX engine override */
  engine?: TeXEngine;
  /** Output directory override */
  outputDir?: string;
  /** Shell escape override */
  shellEscape?: boolean;
  /** Extra latexmk arguments */
  extraArgs?: string[];
  /** Path to custom latexmkrc */
  latexmkrc?: string;
}

/**
 * Handles loading and saving per-project configuration files
 */
export class ProjectConfigLoader {
  /**
   * Check if a project has a config file
   */
  static hasConfigFile(projectPath: string): boolean {
    const configPath = path.join(projectPath, PROJECT_CONFIG_FILE);
    return fsSync.existsSync(configPath);
  }

  /**
   * Load project configuration from file
   * Returns null if no config file exists
   */
  static async loadConfig(projectPath: string): Promise<ProjectConfigFile | null> {
    const configPath = path.join(projectPath, PROJECT_CONFIG_FILE);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as ProjectConfigFile;
      return this.validateConfig(config);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null; // File doesn't exist
      }
      console.error(`Error loading project config from ${configPath}:`, error);
      return null;
    }
  }

  /**
   * Save project configuration to file
   */
  static async saveConfig(projectPath: string, config: ProjectConfigFile): Promise<boolean> {
    const configPath = path.join(projectPath, PROJECT_CONFIG_FILE);

    try {
      const content = JSON.stringify(config, null, 2);
      await fs.writeFile(configPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error(`Error saving project config to ${configPath}:`, error);
      return false;
    }
  }

  /**
   * Merge file config with defaults to create a full LaTeXProjectConfig
   */
  static mergeWithDefaults(
    projectPath: string,
    fileConfig: ProjectConfigFile | null,
    defaultMainFile: string
  ): LaTeXProjectConfig {
    return {
      rootPath: projectPath,
      mainFile: fileConfig?.mainFile || defaultMainFile,
      engine: fileConfig?.engine || DEFAULT_SETTINGS.defaultEngine,
      outputDir: fileConfig?.outputDir || DEFAULT_SETTINGS.defaultOutputDir,
      shellEscape: fileConfig?.shellEscape ?? DEFAULT_SETTINGS.shellEscape,
      extraLatexmkArgs: fileConfig?.extraArgs || [],
      latexmkrcPath: fileConfig?.latexmkrc,
    };
  }

  /**
   * Extract saveable config from a LaTeXProjectConfig
   */
  static extractFileConfig(config: LaTeXProjectConfig): ProjectConfigFile {
    const fileConfig: ProjectConfigFile = {
      mainFile: config.mainFile,
    };

    // Only include non-default values
    if (config.engine !== DEFAULT_SETTINGS.defaultEngine) {
      fileConfig.engine = config.engine;
    }
    if (config.outputDir !== DEFAULT_SETTINGS.defaultOutputDir) {
      fileConfig.outputDir = config.outputDir;
    }
    if (config.shellEscape !== DEFAULT_SETTINGS.shellEscape) {
      fileConfig.shellEscape = config.shellEscape;
    }
    if (config.extraLatexmkArgs.length > 0) {
      fileConfig.extraArgs = config.extraLatexmkArgs;
    }
    if (config.latexmkrcPath) {
      fileConfig.latexmkrc = config.latexmkrcPath;
    }

    return fileConfig;
  }

  /**
   * Validate and sanitize config file contents
   */
  private static validateConfig(config: ProjectConfigFile): ProjectConfigFile {
    const validated: ProjectConfigFile = {};

    if (typeof config.mainFile === 'string') {
      validated.mainFile = config.mainFile;
    }

    if (config.engine && ['pdflatex', 'xelatex', 'lualatex'].includes(config.engine)) {
      validated.engine = config.engine as TeXEngine;
    }

    if (typeof config.outputDir === 'string') {
      validated.outputDir = config.outputDir;
    }

    if (typeof config.shellEscape === 'boolean') {
      validated.shellEscape = config.shellEscape;
    }

    if (Array.isArray(config.extraArgs)) {
      validated.extraArgs = config.extraArgs.filter(arg => typeof arg === 'string');
    }

    if (typeof config.latexmkrc === 'string') {
      validated.latexmkrc = config.latexmkrc;
    }

    return validated;
  }
}
