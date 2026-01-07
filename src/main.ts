import {
  App,
  Plugin,
  PluginManifest,
  Notice,
  WorkspaceLeaf,
  TFolder,
  Platform,
  MarkdownView,
  Editor,
  TFile,
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
  VIEW_TYPE_PROJECTS,
  COMMANDS,
} from './constants';
import { LaTeXSettingTab } from './settings';
import { CompilerBackend } from './compiler/CompilerBackend';
import { LatexmkBackend } from './compiler/LatexmkBackend';
import { TectonicBackend } from './compiler/TectonicBackend';
import { CompileOrchestrator } from './compiler/CompileOrchestrator';
import { DiagnosticsView } from './views/DiagnosticsView';
import { PDFPreviewView } from './views/PDFPreviewView';
import { ProjectsView } from './views/ProjectsView';
import { StatusBarItem } from './views/StatusBarItem';
import {
  ProjectManager,
  ProjectSelectModal,
  ProjectConfigModal,
} from './project/ProjectManager';
import { isLatexmkAvailable } from './utils/platform';
import { FileWatcher } from './utils/fileWatcher';
import { SourceLocation } from './utils/synctex';
import * as path from 'path';
import * as fs from 'fs';

export default class LaTeXCompilerPlugin extends Plugin {
  settings: LaTeXPluginSettings = DEFAULT_SETTINGS;
  private backend!: CompilerBackend;
  private latexmkBackend!: LatexmkBackend;
  private tectonicBackend!: TectonicBackend;
  private orchestrator!: CompileOrchestrator;
  private projectManager!: ProjectManager;
  private statusBarItem!: StatusBarItem;
  private fileWatcher!: FileWatcher;
  private diagnosticsView: DiagnosticsView | null = null;
  private pdfPreviewView: PDFPreviewView | null = null;
  private projectsView: ProjectsView | null = null;
  private currentProjectRoot: string | null = null;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  /**
   * Get the plugin directory path
   */
  getPluginDir(): string {
    return path.join(
      (this.app.vault.adapter as any).basePath,
      '.obsidian',
      'plugins',
      this.manifest.id
    );
  }

  async onload(): Promise<void> {
    // Check for mobile - this plugin requires desktop
    if (Platform.isMobile) {
      new Notice('LaTeX Compiler requires a desktop environment. This plugin will not work on mobile.');
      console.log('LaTeX Compiler: Mobile detected, plugin disabled');
      return;
    }

    console.log('Loading LaTeX Compiler plugin');

    // Load settings
    await this.loadSettings();

    // Initialize backends
    const pluginDir = this.getPluginDir();
    this.latexmkBackend = new LatexmkBackend(this.settings);
    this.tectonicBackend = new TectonicBackend(this.settings, pluginDir);

    // Select active backend based on settings
    this.backend = this.settings.compilerBackend === 'tectonic'
      ? this.tectonicBackend
      : this.latexmkBackend;

    // Initialize components
    this.orchestrator = new CompileOrchestrator(this.backend);
    this.projectManager = new ProjectManager(this.app, this.settings);
    this.fileWatcher = new FileWatcher(this.app);

    // Set up orchestrator event handlers
    this.setupOrchestratorEvents();

    // Register views
    this.registerView(VIEW_TYPE_DIAGNOSTICS, (leaf) => {
      this.diagnosticsView = new DiagnosticsView(leaf);
      return this.diagnosticsView;
    });

    this.registerView(VIEW_TYPE_PDF_PREVIEW, (leaf) => {
      this.pdfPreviewView = new PDFPreviewView(leaf);
      // Wire up reverse search callback
      this.pdfPreviewView.setReverseSearchCallback((location: SourceLocation) => {
        this.navigateToSource(location);
      });
      return this.pdfPreviewView;
    });

    this.registerView(VIEW_TYPE_PROJECTS, (leaf) => {
      this.projectsView = new ProjectsView(leaf);

      // Wire up callbacks
      this.projectsView.onCompile = async (project) => {
        await this.runCompilation(project);
      };
      this.projectsView.onWatch = (project) => {
        this.startWatchingProject(project);
      };
      this.projectsView.onStopWatch = (project) => {
        this.fileWatcher.stopWatching(project.rootPath);
        this.statusBarItem.setIdle();
        new Notice(`Stopped watching ${path.basename(project.mainFile)}`);
        this.updateProjectsView();
      };
      this.projectsView.onClean = async (project) => {
        const result = await this.backend.clean(project);
        if (result.success) {
          new Notice(`Cleaned: ${path.basename(project.mainFile)}`);
        } else {
          new Notice(`Clean failed: ${result.message}`);
        }
      };

      // Initial data
      this.projectsView.setProjects(this.projectManager.getProjects());

      return this.projectsView;
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

    this.addCommand({
      id: 'show-build-log',
      name: 'Show Build Log',
      callback: () => this.showBuildLog(),
    });

    this.addCommand({
      id: 'watch',
      name: 'Watch LaTeX Project',
      callback: () => this.watchProject(),
    });

    this.addCommand({
      id: 'stop-watch',
      name: 'Stop Watching LaTeX Project',
      callback: () => this.stopWatching(),
    });

    this.addCommand({
      id: 'show-projects',
      name: 'Show LaTeX Projects',
      callback: () => this.activateProjectsView(),
    });

    this.addCommand({
      id: 'synctex-forward',
      name: 'SyncTeX: Jump to PDF from Source',
      editorCallback: (editor, ctx) => {
        const view = ctx instanceof MarkdownView ? ctx : null;
        this.syncTeXForwardSearch(editor, view);
      },
    });

    this.addCommand({
      id: 'synctex-reverse',
      name: 'SyncTeX: Jump to Source from PDF',
      callback: () => this.syncTeXReverseSearch(),
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
    this.fileWatcher.stopAll();
    this.statusBarItem.remove();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);

    // Update backends with new settings
    this.latexmkBackend.updateSettings(this.settings);
    this.tectonicBackend.updateSettings(this.settings);

    // Switch backend if needed
    const newBackend = this.settings.compilerBackend === 'tectonic'
      ? this.tectonicBackend
      : this.latexmkBackend;

    if (newBackend !== this.backend) {
      this.backend = newBackend;
      this.orchestrator.setBackend(newBackend);
    }

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
        this.handleBuildResult(job.result, job.project.rootPath);
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
  private async handleBuildResult(result: BuildResult, projectPath: string): Promise<void> {
    // Update diagnostics view
    if (this.diagnosticsView) {
      this.diagnosticsView.setDiagnostics(result);
    }

    // Update projects view
    this.updateProjectsView();
    this.projectsView?.setBuildResult(projectPath, result);

    // Open diagnostics view if there are errors
    if (!result.success) {
      await this.activateDiagnosticsView();
    }

    // Show PDF preview if successful
    if (result.success && result.pdfPath) {
      await this.showPdfPreview(result.pdfPath, projectPath);
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
    // Check if backend is available
    const available = await this.orchestrator.isBackendAvailable();
    if (!available && this.settings.compilerBackend === 'latexmk') {
      new Notice(
        'latexmk not found. Please install TeX Live or MacTeX and configure the path in settings.'
      );
      return;
    }
    // For Tectonic, isAvailable returns true if it can be downloaded,
    // and the actual download happens during compilation

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

      // Create default config (loads from .obsidian-latex.json if present)
      config = await this.projectManager.createDefaultConfig(absolutePath, entrypoints[0]);

      // Show config modal
      new ProjectConfigModal(
        this.app,
        config,
        entrypoints,
        async (finalConfig) => {
          this.projectManager.addProject(finalConfig);
          await this.saveSettings();
          this.updateProjectsView();
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
   * Clean build artifacts for a project using latexmk -C
   */
  async cleanProject(): Promise<void> {
    const projects = this.projectManager.getProjects();

    if (projects.length === 0) {
      new Notice('No LaTeX projects configured');
      return;
    }

    for (const project of projects) {
      try {
        const result = await this.backend.clean(project);
        if (result.success) {
          new Notice(`Cleaned: ${path.basename(project.mainFile)}`);
        } else {
          new Notice(`Clean warning: ${result.message}`);
        }
      } catch (error) {
        console.error('Clean error:', error);
        new Notice(`Failed to clean: ${error}`);
      }
    }
  }

  /**
   * Show the build log for the last compiled project
   */
  async showBuildLog(): Promise<void> {
    const projects = this.projectManager.getProjects();

    if (projects.length === 0) {
      new Notice('No LaTeX projects configured');
      return;
    }

    // Use first project or could add a picker for multiple projects
    const project = projects[0];
    const logPath = path.join(project.rootPath, project.outputDir, 'build.log');

    if (!fs.existsSync(logPath)) {
      new Notice('No build log found. Run a compilation first.');
      return;
    }

    // Read log content and copy to clipboard
    try {
      const logContent = fs.readFileSync(logPath, 'utf-8');

      // Copy log content to clipboard for easy access
      await navigator.clipboard.writeText(logContent);
      new Notice(`Build log copied to clipboard.\n\nPath: ${logPath}`);
    } catch (error) {
      console.error('Error reading build log:', error);
      new Notice(`Failed to read build log: ${error}`);
    }
  }

  /**
   * Check LaTeX installation
   */
  async checkInstallation(): Promise<void> {
    if (this.settings.compilerBackend === 'tectonic') {
      const available = await this.tectonicBackend.isAvailable();
      if (available) {
        const version = await this.tectonicBackend.getVersion();
        new Notice(`Tectonic ${version || ''} is available and ready`);
      } else {
        new Notice(
          'Tectonic will be downloaded automatically on first compilation.\n' +
            'Or go to Settings to download it now.'
        );
      }
    } else {
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
   * Activate the projects view
   */
  async activateProjectsView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROJECTS);

    if (leaves.length === 0) {
      const leaf = this.app.workspace.getLeftLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_PROJECTS,
          active: true,
        });
      }
    } else {
      this.app.workspace.revealLeaf(leaves[0]);
    }
  }

  /**
   * Update the projects view with current data
   */
  private updateProjectsView(): void {
    if (this.projectsView) {
      this.projectsView.setProjects(this.projectManager.getProjects());
      this.projectsView.setWatchedProjects(
        new Set(this.fileWatcher.getWatchedProjects().map(p => p.rootPath))
      );
    }
  }

  /**
   * Show PDF preview
   */
  async showPdfPreview(pdfPath: string, projectRoot?: string): Promise<void> {
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

    // Store current project root for SyncTeX
    if (projectRoot) {
      this.currentProjectRoot = projectRoot;
    }

    // Load PDF with project root for SyncTeX support
    const view = leaf.view as PDFPreviewView;
    await view.loadPdf(pdfPath, projectRoot || this.currentProjectRoot || undefined);
    this.app.workspace.revealLeaf(leaf);
  }

  /**
   * Start watching a LaTeX project for file changes
   */
  async watchProject(): Promise<void> {
    // Check if backend is available
    const available = await this.orchestrator.isBackendAvailable();
    if (!available && this.settings.compilerBackend === 'latexmk') {
      new Notice(
        'latexmk not found. Please install TeX Live or MacTeX and configure the path in settings.'
      );
      return;
    }
    // For Tectonic, isAvailable returns true if it can be downloaded

    // Find folders with .tex files
    const folders = await this.projectManager.findLatexFolders();

    if (folders.length === 0) {
      new Notice('No folders with .tex files found in your vault');
      return;
    }

    // If only one folder, watch it directly
    if (folders.length === 1) {
      await this.startWatchingFolder(folders[0]);
      return;
    }

    // Show folder picker
    new ProjectSelectModal(this.app, folders, async (folder) => {
      await this.startWatchingFolder(folder);
    }).open();
  }

  /**
   * Start watching a specific folder
   */
  private async startWatchingFolder(folderPath: string): Promise<void> {
    const absolutePath = this.projectManager.toAbsolutePath(folderPath);

    // Check if already watching
    if (this.fileWatcher.isWatching(absolutePath)) {
      new Notice('Already watching this project');
      return;
    }

    // Get or create project config
    let config = this.projectManager.getProject(absolutePath);

    if (!config) {
      // Discover entrypoints
      const entrypoints = await this.projectManager.discoverEntrypoints(folderPath);

      if (entrypoints.length === 0) {
        new Notice('No .tex files with \\documentclass found in this folder');
        return;
      }

      // Create default config (loads from .obsidian-latex.json if present)
      config = await this.projectManager.createDefaultConfig(absolutePath, entrypoints[0]);

      // Show config modal
      new ProjectConfigModal(
        this.app,
        config,
        entrypoints,
        async (finalConfig) => {
          this.projectManager.addProject(finalConfig);
          await this.saveSettings();
          this.updateProjectsView();
          this.startWatchingProject(finalConfig);
        }
      ).open();
      return;
    }

    // Start watching existing project
    this.startWatchingProject(config);
  }

  /**
   * Start watching a project with the file watcher
   */
  private startWatchingProject(project: LaTeXProjectConfig): void {
    // Default debounce of 500ms
    const debounceMs = this.settings.watchDebounce || 500;

    this.fileWatcher.startWatching(
      project,
      async (proj) => {
        new Notice(`Recompiling ${path.basename(proj.mainFile)}...`);
        await this.runCompilation(proj);
      },
      debounceMs
    );

    this.statusBarItem.setWatching();
    new Notice(`Watching ${path.basename(project.mainFile)} for changes`);
  }

  /**
   * Stop watching all projects
   */
  stopWatching(): void {
    const watchedProjects = this.fileWatcher.getWatchedProjects();

    if (watchedProjects.length === 0) {
      new Notice('No projects being watched');
      return;
    }

    this.fileWatcher.stopAll();
    this.statusBarItem.setIdle();
    new Notice('Stopped watching all projects');
  }

  /**
   * SyncTeX Forward Search: Jump from source to PDF location
   */
  private async syncTeXForwardSearch(editor: Editor, view: MarkdownView | null): Promise<void> {
    if (!view || !view.file) {
      new Notice('No active file');
      return;
    }

    // Get the file path
    const filePath = view.file.path;
    const absolutePath = this.projectManager.toAbsolutePath(filePath);

    // Check if it's a .tex file
    if (!absolutePath.endsWith('.tex')) {
      new Notice('SyncTeX forward search only works with .tex files');
      return;
    }

    // Find the project this file belongs to
    const project = this.findProjectForFile(absolutePath);
    if (!project) {
      new Notice('Could not find LaTeX project for this file. Compile the project first.');
      return;
    }

    // Get current line number (1-indexed)
    const cursor = editor.getCursor();
    const line = cursor.line + 1;

    // Ensure PDF preview is open
    const pdfPath = path.join(
      project.rootPath,
      project.outputDir,
      path.basename(project.mainFile, '.tex') + '.pdf'
    );

    if (!fs.existsSync(pdfPath)) {
      new Notice('PDF not found. Compile the project first.');
      return;
    }

    // Show PDF preview if not already open
    await this.showPdfPreview(pdfPath, project.rootPath);

    // Wait a bit for the view to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Perform forward search
    if (this.pdfPreviewView) {
      const success = this.pdfPreviewView.forwardSearch(absolutePath, line);
      if (success) {
        new Notice(`Jumped to PDF location for line ${line}`);
      } else {
        new Notice('Could not find PDF location for this line. Try recompiling.');
      }
    }
  }

  /**
   * SyncTeX Reverse Search: Show instructions for jumping from PDF to source
   */
  private syncTeXReverseSearch(): void {
    // This is primarily informational - actual reverse search happens via Ctrl+Click
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PDF_PREVIEW);

    if (leaves.length === 0) {
      new Notice('Open PDF preview first, then Ctrl+Click on the PDF to jump to source');
      return;
    }

    if (this.pdfPreviewView?.isSyncTeXAvailable()) {
      new Notice('Ctrl+Click (Cmd+Click on Mac) on the PDF to jump to source');
    } else {
      new Notice('SyncTeX data not available. Recompile the project to enable.');
    }
  }

  /**
   * Navigate to a source file location (for reverse search)
   */
  private async navigateToSource(location: SourceLocation): Promise<void> {
    try {
      // Convert absolute path to vault-relative path
      const vaultPath = (this.app.vault.adapter as any).basePath;
      let relativePath = location.file;

      if (location.file.startsWith(vaultPath)) {
        relativePath = location.file.substring(vaultPath.length + 1);
      }

      // Try to find the file in the vault
      const file = this.app.vault.getAbstractFileByPath(relativePath);

      if (!file || !(file instanceof TFile)) {
        // File might be outside vault or path resolution failed
        new Notice(`Source file not found in vault: ${path.basename(location.file)}`);
        return;
      }

      // Open the file
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);

      // Navigate to the line
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const editor = view.editor;
        // Line is 1-indexed, editor uses 0-indexed
        const line = Math.max(0, location.line - 1);
        editor.setCursor({ line, ch: location.column || 0 });
        editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
      }

      new Notice(`Jumped to ${path.basename(location.file)}:${location.line}`);
    } catch (error) {
      console.error('Failed to navigate to source:', error);
      new Notice('Failed to navigate to source file');
    }
  }

  /**
   * Find the project that contains a given file
   */
  private findProjectForFile(filePath: string): LaTeXProjectConfig | null {
    const projects = this.projectManager.getProjects();

    for (const project of projects) {
      // Check if file is in project root
      if (filePath.startsWith(project.rootPath)) {
        return project;
      }
    }

    // Try to find by checking parent directories
    let dir = path.dirname(filePath);
    while (dir && dir !== path.dirname(dir)) {
      for (const project of projects) {
        if (project.rootPath === dir) {
          return project;
        }
      }
      dir = path.dirname(dir);
    }

    return null;
  }
}
