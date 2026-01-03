import { ItemView, WorkspaceLeaf, Setting, ButtonComponent } from 'obsidian';
import { VIEW_TYPE_PROJECTS } from '../constants';
import { LaTeXProjectConfig, BuildResult } from '../types';

export class ProjectsView extends ItemView {
  private projects: LaTeXProjectConfig[] = [];
  private watchedProjects: Set<string> = new Set();
  private buildResults: Map<string, BuildResult> = new Map();

  // Event callbacks (set by plugin)
  public onCompile?: (project: LaTeXProjectConfig) => Promise<void>;
  public onWatch?: (project: LaTeXProjectConfig) => void;
  public onStopWatch?: (project: LaTeXProjectConfig) => void;
  public onClean?: (project: LaTeXProjectConfig) => Promise<void>;
  public onConfigure?: (project: LaTeXProjectConfig) => void;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PROJECTS;
  }

  getDisplayText(): string {
    return 'LaTeX Projects';
  }

  getIcon(): string {
    return 'file-code';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    // Cleanup if needed
  }

  // Call this when projects list changes
  setProjects(projects: LaTeXProjectConfig[]): void {
    this.projects = projects;
    this.render();
  }

  // Call this when watch status changes
  setWatchedProjects(watched: Set<string>): void {
    this.watchedProjects = watched;
    this.render();
  }

  // Call this when build completes
  setBuildResult(projectPath: string, result: BuildResult): void {
    this.buildResults.set(projectPath, result);
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    container.createEl('h4', { text: 'LaTeX Projects' });

    if (this.projects.length === 0) {
      container.createEl('p', {
        text: 'No projects configured. Use "Compile LaTeX Project" to add one.',
        cls: 'latex-projects-empty'
      });
      return;
    }

    for (const project of this.projects) {
      this.renderProject(container, project);
    }
  }

  private renderProject(container: HTMLElement, project: LaTeXProjectConfig): void {
    const projectEl = container.createDiv({ cls: 'latex-project-item' });

    // Header with project name
    const header = projectEl.createDiv({ cls: 'latex-project-header' });
    const projectName = project.rootPath.split('/').pop() || project.rootPath;
    header.createEl('strong', { text: projectName });

    // Details
    const details = projectEl.createDiv({ cls: 'latex-project-details' });
    details.createEl('div', { text: `Main: ${project.mainFile}` });
    details.createEl('div', { text: `Engine: ${project.engine}` });

    // Status
    const isWatching = this.watchedProjects.has(project.rootPath);
    const buildResult = this.buildResults.get(project.rootPath);

    const statusEl = details.createDiv({ cls: 'latex-project-status' });
    if (isWatching) {
      statusEl.createSpan({ text: 'Watching', cls: 'latex-status-watching' });
    }
    if (buildResult) {
      const statusClass = buildResult.success ? 'latex-status-success' : 'latex-status-error';
      const statusText = buildResult.success ? 'Build OK' : 'Build Failed';
      statusEl.createSpan({ text: statusText, cls: statusClass });
    }

    // Buttons
    const buttons = projectEl.createDiv({ cls: 'latex-project-buttons' });

    new ButtonComponent(buttons)
      .setButtonText('Compile')
      .setTooltip('Compile this project')
      .onClick(() => this.onCompile?.(project));

    if (isWatching) {
      new ButtonComponent(buttons)
        .setButtonText('Stop Watch')
        .onClick(() => this.onStopWatch?.(project));
    } else {
      new ButtonComponent(buttons)
        .setButtonText('Watch')
        .onClick(() => this.onWatch?.(project));
    }

    new ButtonComponent(buttons)
      .setButtonText('Clean')
      .onClick(() => this.onClean?.(project));
  }
}
