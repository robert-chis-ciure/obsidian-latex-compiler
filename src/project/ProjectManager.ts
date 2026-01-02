import { App, TFolder, TFile, Modal, Setting } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import { LaTeXProjectConfig, LaTeXPluginSettings, TeXEngine } from '../types';
import { ProjectConfigLoader, PROJECT_CONFIG_FILE } from './ProjectConfig';

/**
 * Manages LaTeX project discovery and configuration
 */
export class ProjectManager {
  private app: App;
  private settings: LaTeXPluginSettings;
  private vaultBasePath: string;

  constructor(app: App, settings: LaTeXPluginSettings) {
    this.app = app;
    this.settings = settings;
    this.vaultBasePath = (this.app.vault.adapter as any).basePath || '';
  }

  /**
   * Update settings reference
   */
  updateSettings(settings: LaTeXPluginSettings): void {
    this.settings = settings;
  }

  /**
   * Get all registered projects
   */
  getProjects(): LaTeXProjectConfig[] {
    return this.settings.projects;
  }

  /**
   * Find a project by its root path
   */
  getProject(rootPath: string): LaTeXProjectConfig | undefined {
    return this.settings.projects.find(p => p.rootPath === rootPath);
  }

  /**
   * Register a new project
   */
  addProject(project: LaTeXProjectConfig): void {
    // Remove existing project with same path
    this.settings.projects = this.settings.projects.filter(
      p => p.rootPath !== project.rootPath
    );
    this.settings.projects.push(project);
  }

  /**
   * Remove a project
   */
  removeProject(rootPath: string): void {
    this.settings.projects = this.settings.projects.filter(
      p => p.rootPath !== rootPath
    );
  }

  /**
   * Create a new project configuration with defaults
   * Checks for .obsidian-latex.json and .latexmkrc files
   */
  async createDefaultConfig(rootPath: string, mainFile = 'main.tex'): Promise<LaTeXProjectConfig> {
    // Check for per-project config file
    const fileConfig = await ProjectConfigLoader.loadConfig(rootPath);

    // Check for .latexmkrc file
    const latexmkrcPath = this.detectLatexmkrc(rootPath);

    // Merge with defaults
    const config = ProjectConfigLoader.mergeWithDefaults(
      rootPath,
      fileConfig,
      mainFile
    );

    // Add detected latexmkrc if not already specified
    if (latexmkrcPath && !config.latexmkrcPath) {
      config.latexmkrcPath = latexmkrcPath;
    }

    return config;
  }

  /**
   * Load or create project configuration
   * Prioritizes: .obsidian-latex.json > registered project > defaults
   */
  async loadProjectConfig(rootPath: string, defaultMainFile = 'main.tex'): Promise<LaTeXProjectConfig> {
    // First check for config file
    if (ProjectConfigLoader.hasConfigFile(rootPath)) {
      return this.createDefaultConfig(rootPath, defaultMainFile);
    }

    // Then check registered projects
    const registered = this.getProject(rootPath);
    if (registered) {
      return registered;
    }

    // Fall back to defaults
    return this.createDefaultConfig(rootPath, defaultMainFile);
  }

  /**
   * Save project configuration to file
   */
  async saveProjectConfigToFile(project: LaTeXProjectConfig): Promise<boolean> {
    const fileConfig = ProjectConfigLoader.extractFileConfig(project);
    return ProjectConfigLoader.saveConfig(project.rootPath, fileConfig);
  }

  /**
   * Check if a project has a config file
   */
  hasConfigFile(rootPath: string): boolean {
    return ProjectConfigLoader.hasConfigFile(rootPath);
  }

  /**
   * Detect .latexmkrc file in project directory
   */
  private detectLatexmkrc(rootPath: string): string | undefined {
    const possibleNames = ['.latexmkrc', 'latexmkrc'];

    for (const name of possibleNames) {
      const rcPath = path.join(rootPath, name);
      if (fs.existsSync(rcPath)) {
        return name; // Return relative path
      }
    }

    return undefined;
  }

  /**
   * Create a new project configuration with defaults (sync version)
   * @deprecated Use async createDefaultConfig instead
   */
  createDefaultConfigSync(rootPath: string, mainFile = 'main.tex'): LaTeXProjectConfig {
    return {
      rootPath,
      mainFile,
      engine: this.settings.defaultEngine,
      outputDir: this.settings.defaultOutputDir,
      shellEscape: this.settings.shellEscape,
      extraLatexmkArgs: [],
    };
  }

  /**
   * Discover potential main.tex files in a folder
   */
  async discoverEntrypoints(folderPath: string): Promise<string[]> {
    const absolutePath = path.join(this.vaultBasePath, folderPath);
    const entrypoints: string[] = [];

    try {
      const files = fs.readdirSync(absolutePath);

      for (const file of files) {
        if (file.endsWith('.tex')) {
          const filePath = path.join(absolutePath, file);
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check if it looks like a main file (has \documentclass)
          if (content.includes('\\documentclass')) {
            entrypoints.push(file);
          }
        }
      }

      // Sort: main.tex first, then alphabetically
      entrypoints.sort((a, b) => {
        if (a === 'main.tex') return -1;
        if (b === 'main.tex') return 1;
        return a.localeCompare(b);
      });
    } catch (err) {
      console.error('Error discovering entrypoints:', err);
    }

    return entrypoints;
  }

  /**
   * Find folders containing .tex files
   */
  async findLatexFolders(): Promise<string[]> {
    const folders: string[] = [];

    const processFolder = async (folder: TFolder) => {
      let hasTexFiles = false;

      for (const child of folder.children) {
        if (child instanceof TFile && child.extension === 'tex') {
          hasTexFiles = true;
          break;
        }
      }

      if (hasTexFiles) {
        folders.push(folder.path);
      }

      // Recurse into subfolders
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          await processFolder(child);
        }
      }
    };

    await processFolder(this.app.vault.getRoot());
    return folders;
  }

  /**
   * Convert vault-relative path to absolute path
   */
  toAbsolutePath(vaultPath: string): string {
    return path.join(this.vaultBasePath, vaultPath);
  }

  /**
   * Convert absolute path to vault-relative path
   */
  toVaultPath(absolutePath: string): string | null {
    const normalizedAbsolute = path.normalize(absolutePath);
    const normalizedBase = path.normalize(this.vaultBasePath);

    if (normalizedAbsolute.startsWith(normalizedBase)) {
      return normalizedAbsolute
        .substring(normalizedBase.length)
        .replace(/^[/\\]/, '')
        .replace(/\\/g, '/');
    }
    return null;
  }
}

/**
 * Modal for selecting a LaTeX project folder
 */
export class ProjectSelectModal extends Modal {
  private folders: string[];
  private onSelect: (folder: string) => void;

  constructor(app: App, folders: string[], onSelect: (folder: string) => void) {
    super(app);
    this.folders = folders;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Select LaTeX Project Folder' });

    if (this.folders.length === 0) {
      contentEl.createEl('p', {
        text: 'No folders with .tex files found in your vault.',
      });
      return;
    }

    for (const folder of this.folders) {
      new Setting(contentEl)
        .setName(folder)
        .addButton(btn =>
          btn.setButtonText('Select').onClick(() => {
            this.onSelect(folder);
            this.close();
          })
        );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Modal for configuring a LaTeX project
 */
export class ProjectConfigModal extends Modal {
  private config: LaTeXProjectConfig;
  private entrypoints: string[];
  private onSave: (config: LaTeXProjectConfig) => void;

  constructor(
    app: App,
    config: LaTeXProjectConfig,
    entrypoints: string[],
    onSave: (config: LaTeXProjectConfig) => void
  ) {
    super(app);
    this.config = { ...config };
    this.entrypoints = entrypoints;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Configure LaTeX Project' });
    contentEl.createEl('p', { text: `Project: ${this.config.rootPath}` });

    // Main file selection
    new Setting(contentEl)
      .setName('Main file')
      .setDesc('The root .tex file to compile')
      .addDropdown(dropdown => {
        for (const entry of this.entrypoints) {
          dropdown.addOption(entry, entry);
        }
        dropdown.setValue(this.config.mainFile);
        dropdown.onChange(value => {
          this.config.mainFile = value;
        });
      });

    // Engine selection
    new Setting(contentEl)
      .setName('TeX Engine')
      .setDesc('Compiler to use')
      .addDropdown(dropdown => {
        dropdown.addOption('pdflatex', 'pdfLaTeX');
        dropdown.addOption('xelatex', 'XeLaTeX');
        dropdown.addOption('lualatex', 'LuaLaTeX');
        dropdown.setValue(this.config.engine);
        dropdown.onChange(value => {
          this.config.engine = value as TeXEngine;
        });
      });

    // Output directory
    new Setting(contentEl)
      .setName('Output directory')
      .setDesc('Directory for build artifacts')
      .addText(text => {
        text.setValue(this.config.outputDir);
        text.onChange(value => {
          this.config.outputDir = value || '.latex-out';
        });
      });

    // Shell escape
    new Setting(contentEl)
      .setName('Shell escape')
      .setDesc('Enable -shell-escape (required for minted, etc.)')
      .addToggle(toggle => {
        toggle.setValue(this.config.shellEscape);
        toggle.onChange(value => {
          this.config.shellEscape = value;
        });
      });

    // Save button
    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Save & Compile')
          .setCta()
          .onClick(() => {
            this.onSave(this.config);
            this.close();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
        })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
