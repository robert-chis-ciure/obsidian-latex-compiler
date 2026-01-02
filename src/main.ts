import {
  App,
  Plugin,
  PluginManifest,
  Notice,
  WorkspaceLeaf,
  TFolder,
} from 'obsidian';
import {
  LaTeXPluginSettings,
  DEFAULT_SETTINGS,
  LaTeXProjectConfig,
  BuildResult,
} from './types';
import {
  VIEW_TYPE_DIAGNOSTICS,
  VIEW_TYPE_PDF_PREVIEW,
  COMMANDS,
} from './constants';
import { LaTeXSettingTab } from './settings';
import { LatexmkBackend } from './compiler/LatexmkBackend';
import { CompileOrchestrator } from './compiler/CompileOrchestrator';
import { DiagnosticsView } from './views/DiagnosticsView';
import { PDFPreviewView } from './views/PDFPreviewView';
import { StatusBarItem } from './views/StatusBarItem';
import {
  ProjectManager,
  ProjectSelectModal,
  ProjectConfigModal,
} from './project/ProjectManager';
import { isLatexmkAvailable } from './utils/platform';
import * as path from 'path';
import * as fs from 'fs';

export default class LaTeXCompilerPlugin extends Plugin {
  settings: LaTeXPluginSettings = DEFAULT_SETTINGS;
  private backend!: LatexmkBackend;
  private orchestrator!: CompileOrchestrator;
  private projectManager!: ProjectManager;
  private statusBarItem!: StatusBarItem;
  private diagnosticsView: DiagnosticsView | null = null;
  private pdfPreviewView: PDFPreviewView | null = null;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  async onload(): Promise<void> {
    console.log('Loading LaTeX Compiler plugin');

    // Load settings
    await this.loadSettings();

    // Initialize components
    this.backend = new LatexmkBackend(this.settings);
    this.orchestrator = new CompileOrchestrator(this.backend);
    this.projectManager = new ProjectManager(this.app, this.settings);

    // Set up orchestrator event handlers
    this.setupOrchestratorEvents();

    // Register views
    this.registerView(VIEW_TYPE_DIAGNOSTICS, (leaf) => {
      this.diagnosticsView = new DiagnosticsView(leaf);
      return this.diagnosticsView;
    });

    this.registerView(VIEW_TYPE_PDF_PREVIEW, (leaf) => {
      this.pdfPreviewView = new PDFPreviewView(leaf);
      return this.pdfPreviewView;
    });

    // Add status bar item
    this.statusBarItem = new StatusBarItem(this.addStatusBarItem());
    this.statusBarItem.getElement().addEventListener('click', () => {
      this.activateDiagnosticsView();
    });

    // Register commands
    this.addCommand({
      id: 'compile',
      name: 'Compile LaTeX Project',
      callback: () => this.compileProject(),
    });

    this.addCommand({
      id: 'show-diagnostics',
      name: 'Show LaTeX Diagnostics',
      callback: () => this.activateDiagnosticsView(),
    });

    this.addCommand({
      id: 'clean',
      name: 'Clean LaTeX Build',
      callback: () => this.cleanProject(),
    });

    this.addCommand({
      id: 'check-installation',
      name: 'Check LaTeX Installation',
      callback: () => this.checkInstallation(),
    });

    // Add settings tab
    this.addSettingTab(new LaTeXSettingTab(this.app, this));

    // Add context menu for folders
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('Compile as LaTeX Project')
              .setIcon('file-code')
              .onClick(() => this.compileFolder(file.path));
          });
        }
      })
    );
  }

  onunload(): void {
    console.log('Unloading LaTeX Compiler plugin');
    this.orchestrator.cancelAll();
    this.statusBarItem.remove();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Update components with new settings
    this.backend.updateSettings(this.settings);
    this.projectManager.updateSettings(this.settings);
  }

  /**
   * Set up event handlers for the compile orchestrator
   */
  private setupOrchestratorEvents(): void {
    this.orchestrator.on('job:started', () => {
      this.statusBarItem.setBuilding();
    });

    this.orchestrator.on('job:completed', (job) => {
      if (job.result) {
        this.statusBarItem.setBuildResult(job.result);
        this.handleBuildResult(job.result);
      }
    });

    this.orchestrator.on('job:cancelled', () => {
      this.statusBarItem.setIdle();
      new Notice('LaTeX compilation cancelled');
    });
  }

  /**
   * Handle build result - update views and show PDF
   */
  private async handleBuildResult(result: BuildResult): Promise<void> {
    // Update diagnostics view
    if (this.diagnosticsView) {
      this.diagnosticsView.setDiagnostics(result);
    }

    // Open diagnostics view if there are errors
    if (!result.success) {
      await this.activateDiagnosticsView();
    }

    // Show PDF preview if successful
    if (result.success && result.pdfPath) {
      await this.showPdfPreview(result.pdfPath);
    }

    // Show notice
    const errorCount = result.diagnostics.filter(d => d.severity === 'error').length;
    const warningCount = result.diagnostics.filter(d => d.severity === 'warning').length;

    if (result.success) {
      if (warningCount > 0) {
        new Notice(`Build succeeded with ${warningCount} warning(s)`);
      } else {
        new Notice('Build succeeded');
      }
    } else {
      new Notice(`Build failed with ${errorCount} error(s)`);
    }
  }

  /**
   * Compile a LaTeX project - shows folder picker if no project selected
   */
  async compileProject(): Promise<void> {
    // Check if latexmk is available
    const available = await this.orchestrator.isBackendAvailable();
    if (!available) {
      new Notice(
        'latexmk not found. Please install TeX Live or MacTeX and configure the path in settings.'
      );
      return;
    }

    // Find folders with .tex files
    const folders = await this.projectManager.findLatexFolders();

    if (folders.length === 0) {
      new Notice('No folders with .tex files found in your vault');
      return;
    }

    // If only one folder, compile it directly
    if (folders.length === 1) {
      await this.compileFolder(folders[0]);
      return;
    }

    // Show folder picker
    new ProjectSelectModal(this.app, folders, async (folder) => {
      await this.compileFolder(folder);
    }).open();
  }

  /**
   * Compile a specific folder
   */
  async compileFolder(folderPath: string): Promise<void> {
    const absolutePath = this.projectManager.toAbsolutePath(folderPath);

    // Check for existing project config
    let config = this.projectManager.getProject(absolutePath);

    if (!config) {
      // Discover entrypoints
      const entrypoints = await this.projectManager.discoverEntrypoints(folderPath);

      if (entrypoints.length === 0) {
        new Notice('No .tex files with \\documentclass found in this folder');
        return;
      }

      // Create default config
      config = this.projectManager.createDefaultConfig(absolutePath, entrypoints[0]);

      // Show config modal
      new ProjectConfigModal(
        this.app,
        config,
        entrypoints,
        async (finalConfig) => {
          this.projectManager.addProject(finalConfig);
          await this.saveSettings();
          await this.runCompilation(finalConfig);
        }
      ).open();
      return;
    }

    // Compile existing project
    await this.runCompilation(config);
  }

  /**
   * Run compilation for a project
   */
  private async runCompilation(project: LaTeXProjectConfig): Promise<void> {
    try {
      new Notice(`Compiling ${path.basename(project.mainFile)}...`);
      await this.orchestrator.compile(project);
    } catch (error) {
      console.error('Compilation error:', error);
      new Notice(`Compilation error: ${error}`);
    }
  }

  /**
   * Clean build artifacts for a project
   */
  async cleanProject(): Promise<void> {
    const projects = this.projectManager.getProjects();

    if (projects.length === 0) {
      new Notice('No LaTeX projects configured');
      return;
    }

    for (const project of projects) {
      const outputPath = path.join(project.rootPath, project.outputDir);
      try {
        if (fs.existsSync(outputPath)) {
          fs.rmSync(outputPath, { recursive: true });
          new Notice(`Cleaned build directory: ${project.outputDir}`);
        }
      } catch (error) {
        console.error('Clean error:', error);
        new Notice(`Failed to clean: ${error}`);
      }
    }
  }

  /**
   * Check LaTeX installation
   */
  async checkInstallation(): Promise<void> {
    const available = await isLatexmkAvailable(this.settings.texPath);

    if (available) {
      new Notice('LaTeX installation OK - latexmk is available');
    } else {
      new Notice(
        'latexmk not found. Please install TeX Live or MacTeX.\n' +
          'macOS: brew install --cask mactex-no-gui\n' +
          'Then configure the TeX path in plugin settings.'
      );
    }
  }

  /**
   * Activate the diagnostics view
   */
  async activateDiagnosticsView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIAGNOSTICS);

    if (leaves.length === 0) {
      // Create new view in right sidebar
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_DIAGNOSTICS,
          active: true,
        });
      }
    } else {
      // Reveal existing view
      this.app.workspace.revealLeaf(leaves[0]);
    }
  }

  /**
   * Show PDF preview
   */
  async showPdfPreview(pdfPath: string): Promise<void> {
    let leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PDF_PREVIEW);
    let leaf: WorkspaceLeaf;

    if (leaves.length === 0) {
      // Create new view to the right of the active view
      const activeLeaf = this.app.workspace.getLeaf(false);
      leaf = this.app.workspace.createLeafBySplit(activeLeaf, 'vertical');
      await leaf.setViewState({
        type: VIEW_TYPE_PDF_PREVIEW,
        active: true,
      });
    } else {
      leaf = leaves[0];
    }

    // Load PDF
    const view = leaf.view as PDFPreviewView;
    await view.loadPdf(pdfPath);
    this.app.workspace.revealLeaf(leaf);
  }
}
