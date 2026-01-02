import { App, TFile, TAbstractFile, EventRef } from 'obsidian';
import { LaTeXProjectConfig } from '../types';
import { WATCH_EXTENSIONS } from '../constants';
import { debounce } from './debounce';

/**
 * File watcher using Obsidian's vault events
 * Avoids native module issues (like chokidar) in Obsidian
 */
export class FileWatcher {
  private app: App;
  private watchedProjects: Map<string, WatchState> = new Map();
  private eventRefs: EventRef[] = [];

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Start watching a project for file changes
   */
  startWatching(
    project: LaTeXProjectConfig,
    onTrigger: (project: LaTeXProjectConfig) => void,
    debounceMs: number = 500
  ): void {
    const projectPath = project.rootPath;

    // Don't double-watch
    if (this.watchedProjects.has(projectPath)) {
      return;
    }

    // Create debounced callback
    const debouncedTrigger = debounce(() => {
      onTrigger(project);
    }, debounceMs);

    const watchState: WatchState = {
      project,
      debouncedTrigger,
      active: true,
    };

    this.watchedProjects.set(projectPath, watchState);

    // If this is the first project, set up vault event listeners
    if (this.watchedProjects.size === 1) {
      this.setupVaultListeners();
    }
  }

  /**
   * Stop watching a project
   */
  stopWatching(projectPath: string): void {
    this.watchedProjects.delete(projectPath);

    // If no more projects, remove vault listeners
    if (this.watchedProjects.size === 0) {
      this.removeVaultListeners();
    }
  }

  /**
   * Stop watching all projects
   */
  stopAll(): void {
    this.watchedProjects.clear();
    this.removeVaultListeners();
  }

  /**
   * Check if a project is being watched
   */
  isWatching(projectPath: string): boolean {
    return this.watchedProjects.has(projectPath);
  }

  /**
   * Get list of watched projects
   */
  getWatchedProjects(): LaTeXProjectConfig[] {
    return Array.from(this.watchedProjects.values()).map(ws => ws.project);
  }

  /**
   * Set up vault event listeners
   */
  private setupVaultListeners(): void {
    // Listen for file modifications
    const modifyRef = this.app.vault.on('modify', (file) => {
      this.handleFileChange(file, 'modify');
    });
    this.eventRefs.push(modifyRef);

    // Listen for file creation
    const createRef = this.app.vault.on('create', (file) => {
      this.handleFileChange(file, 'create');
    });
    this.eventRefs.push(createRef);

    // Listen for file deletion
    const deleteRef = this.app.vault.on('delete', (file) => {
      this.handleFileChange(file, 'delete');
    });
    this.eventRefs.push(deleteRef);

    // Listen for file rename
    const renameRef = this.app.vault.on('rename', (file, oldPath) => {
      this.handleFileChange(file, 'rename');
    });
    this.eventRefs.push(renameRef);
  }

  /**
   * Remove vault event listeners
   */
  private removeVaultListeners(): void {
    for (const ref of this.eventRefs) {
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
  }

  /**
   * Handle a file change event
   */
  private handleFileChange(file: TAbstractFile, event: string): void {
    // Only handle files, not folders
    if (!(file instanceof TFile)) {
      return;
    }

    const filePath = file.path;
    const extension = file.extension;

    // Check if this is a watched file type
    if (!WATCH_EXTENSIONS.includes(`.${extension}`)) {
      return;
    }

    // Check which project(s) this file belongs to
    for (const [projectPath, watchState] of this.watchedProjects) {
      if (this.isFileInProject(filePath, watchState.project)) {
        // Trigger the debounced compilation
        watchState.debouncedTrigger();
      }
    }
  }

  /**
   * Check if a file is part of a project (and not in output directory)
   */
  private isFileInProject(filePath: string, project: LaTeXProjectConfig): boolean {
    // Get vault-relative project path
    const vaultBasePath = (this.app.vault.adapter as any).basePath || '';
    const vaultRelativeProjectPath = project.rootPath.replace(vaultBasePath, '').replace(/^\//, '');

    // Check if file is in project folder
    if (!filePath.startsWith(vaultRelativeProjectPath)) {
      return false;
    }

    // Check if file is in output directory (should be ignored)
    const relativeFilePath = filePath.slice(vaultRelativeProjectPath.length).replace(/^\//, '');
    if (relativeFilePath.startsWith(project.outputDir)) {
      return false;
    }

    return true;
  }
}

interface WatchState {
  project: LaTeXProjectConfig;
  debouncedTrigger: () => void;
  active: boolean;
}
