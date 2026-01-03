# Task 1: ProjectsView Sidebar + Mobile Notice

> **Priority**: High | **Estimated Complexity**: Medium
> **Independence**: This task modifies only UI layer files and has no overlap with other tasks.

## Objective

Create a sidebar view showing all configured LaTeX projects with their status, plus add a mobile detection notice.

## Files to Create

- `src/views/ProjectsView.ts`

## Files to Modify

- `src/main.ts` - Register view, add mobile notice
- `src/constants.ts` - Add VIEW_TYPE_PROJECTS constant

---

## Implementation Requirements

### 1. Add constant to `src/constants.ts`

Add at the end of the file:

```typescript
export const VIEW_TYPE_PROJECTS = 'latex-projects-view';
```

### 2. Create `src/views/ProjectsView.ts`

Follow the pattern from `DiagnosticsView.ts`:

```typescript
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
    const container = this.containerEl.children[1];
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
```

### 3. Modify `src/main.ts`

#### 3.1 Add imports at the top:

```typescript
import { Platform } from 'obsidian';
import { VIEW_TYPE_PROJECTS } from './constants';
import { ProjectsView } from './views/ProjectsView';
```

#### 3.2 Add mobile detection at the START of `onload()`:

```typescript
async onload(): Promise<void> {
  // Check for mobile - this plugin requires desktop
  if (Platform.isMobile) {
    new Notice('LaTeX Compiler requires a desktop environment. This plugin will not work on mobile.');
    console.log('LaTeX Compiler: Mobile detected, plugin disabled');
    return;
  }

  console.log('Loading LaTeX Compiler plugin');
  // ... rest of existing code
}
```

#### 3.3 Add ProjectsView property:

```typescript
private projectsView: ProjectsView | null = null;
```

#### 3.4 Register the ProjectsView after the other views:

```typescript
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
```

#### 3.5 Add command to show projects view:

```typescript
this.addCommand({
  id: 'show-projects',
  name: 'Show LaTeX Projects',
  callback: () => this.activateProjectsView(),
});
```

#### 3.6 Add method to activate projects view:

```typescript
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
```

#### 3.7 Add helper to update projects view:

```typescript
private updateProjectsView(): void {
  if (this.projectsView) {
    this.projectsView.setProjects(this.projectManager.getProjects());
    this.projectsView.setWatchedProjects(
      new Set(this.fileWatcher.getWatchedProjects().map(p => p.rootPath))
    );
  }
}
```

#### 3.8 Call `updateProjectsView()` after compilations and project changes:

- In `handleBuildResult()`: Add `this.updateProjectsView()` and `this.projectsView?.setBuildResult(...)`
- After `this.projectManager.addProject()`: Add `this.updateProjectsView()`

---

## CSS Styles (Optional Enhancement)

Add to `styles.css`:

```css
.latex-project-item {
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
}

.latex-project-header {
  margin-bottom: 4px;
}

.latex-project-details {
  font-size: 0.9em;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.latex-project-status {
  margin-top: 4px;
}

.latex-status-watching {
  color: var(--text-accent);
  margin-right: 8px;
}

.latex-status-success {
  color: var(--color-green);
}

.latex-status-error {
  color: var(--color-red);
}

.latex-project-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.latex-projects-empty {
  color: var(--text-muted);
  font-style: italic;
}
```

---

## Acceptance Criteria

- [ ] ProjectsView shows in left sidebar when "Show LaTeX Projects" command is run
- [ ] All registered projects are listed with correct info (name, main file, engine)
- [ ] Watch status is shown for watched projects
- [ ] Build status (success/error) is shown for compiled projects
- [ ] Compile/Watch/Stop Watch/Clean buttons work correctly
- [ ] Empty state shows helpful message when no projects configured
- [ ] Mobile users see a notice and plugin doesn't initialize
- [ ] Code follows existing patterns in the codebase
- [ ] No TypeScript errors when building

---

## Testing

1. Build the plugin: `npm run build`
2. Test on desktop: Verify all features work
3. Test mobile detection: If possible, test that mobile devices see the notice
4. Test empty state: Remove all projects and verify empty message
5. Test all buttons: Compile, Watch, Stop Watch, Clean
