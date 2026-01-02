import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import { VIEW_TYPE_DIAGNOSTICS } from '../constants';
import { Diagnostic, BuildResult } from '../types';
import { sortDiagnostics, getDiagnosticCounts, getSuggestion } from '../parser/diagnostics';
import * as path from 'path';

/**
 * Diagnostics panel view
 * Displays compilation errors and warnings with click-to-source navigation
 */
export class DiagnosticsView extends ItemView {
  private diagnostics: Diagnostic[] = [];
  private lastBuildResult: BuildResult | null = null;
  private vaultBasePath: string;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.vaultBasePath = (this.app.vault.adapter as any).basePath || '';
  }

  getViewType(): string {
    return VIEW_TYPE_DIAGNOSTICS;
  }

  getDisplayText(): string {
    return 'LaTeX Diagnostics';
  }

  getIcon(): string {
    return 'alert-circle';
  }

  /**
   * Update diagnostics display
   */
  setDiagnostics(result: BuildResult): void {
    this.lastBuildResult = result;
    this.diagnostics = sortDiagnostics(result.diagnostics);
    this.render();
  }

  /**
   * Clear diagnostics
   */
  clear(): void {
    this.diagnostics = [];
    this.lastBuildResult = null;
    this.render();
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    // Cleanup if needed
  }

  /**
   * Render the diagnostics panel
   */
  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();

    // Add header
    const header = container.createDiv({ cls: 'latex-diagnostics-header' });

    if (this.lastBuildResult) {
      const counts = getDiagnosticCounts(this.diagnostics);
      const statusIcon = this.lastBuildResult.success ? 'check-circle' : 'x-circle';
      const statusClass = this.lastBuildResult.success ? 'success' : 'error';

      const statusEl = header.createDiv({ cls: `latex-status ${statusClass}` });
      setIcon(statusEl.createSpan(), statusIcon);
      statusEl.createSpan({
        text: this.lastBuildResult.success ? ' Build succeeded' : ' Build failed',
      });

      const countsEl = header.createDiv({ cls: 'latex-counts' });
      if (counts.errors > 0) {
        countsEl.createSpan({
          cls: 'latex-count error',
          text: `${counts.errors} error${counts.errors !== 1 ? 's' : ''}`,
        });
      }
      if (counts.warnings > 0) {
        countsEl.createSpan({
          cls: 'latex-count warning',
          text: `${counts.warnings} warning${counts.warnings !== 1 ? 's' : ''}`,
        });
      }

      const durationEl = header.createDiv({ cls: 'latex-duration' });
      durationEl.createSpan({
        text: `Completed in ${(this.lastBuildResult.durationMs / 1000).toFixed(1)}s`,
      });
    } else {
      header.createSpan({ text: 'No build results yet' });
    }

    // Add diagnostics list
    const list = container.createDiv({ cls: 'latex-diagnostics-list' });

    if (this.diagnostics.length === 0 && this.lastBuildResult?.success) {
      list.createDiv({
        cls: 'latex-no-diagnostics',
        text: 'No errors or warnings',
      });
      return;
    }

    for (const diagnostic of this.diagnostics) {
      this.renderDiagnostic(list, diagnostic);
    }
  }

  /**
   * Render a single diagnostic item
   */
  private renderDiagnostic(container: HTMLElement, diagnostic: Diagnostic): void {
    const item = container.createDiv({
      cls: `latex-diagnostic ${diagnostic.severity}`,
    });

    // Severity icon
    const iconEl = item.createSpan({ cls: 'latex-diagnostic-icon' });
    const icon = diagnostic.severity === 'error' ? 'x-circle' :
                 diagnostic.severity === 'warning' ? 'alert-triangle' : 'info';
    setIcon(iconEl, icon);

    // Location (clickable)
    const locationEl = item.createSpan({ cls: 'latex-diagnostic-location' });
    const fileName = this.getRelativePath(diagnostic.file);
    const lineInfo = diagnostic.line ? `:${diagnostic.line}` : '';
    locationEl.setText(`${fileName}${lineInfo}`);
    locationEl.addEventListener('click', () => this.navigateToSource(diagnostic));

    // Message
    const messageEl = item.createDiv({ cls: 'latex-diagnostic-message' });
    messageEl.setText(diagnostic.message);

    // Suggestion
    const suggestion = getSuggestion(diagnostic);
    if (suggestion) {
      const suggestionEl = item.createDiv({ cls: 'latex-diagnostic-suggestion' });
      suggestionEl.setText(suggestion);
    }

    // Raw text (collapsible)
    if (diagnostic.rawText && diagnostic.rawText.length > diagnostic.message.length + 10) {
      const detailsEl = item.createEl('details', { cls: 'latex-diagnostic-details' });
      detailsEl.createEl('summary', { text: 'Show full context' });
      const codeEl = detailsEl.createEl('pre');
      codeEl.createEl('code', { text: diagnostic.rawText });
    }
  }

  /**
   * Navigate to source file at the diagnostic location
   */
  private async navigateToSource(diagnostic: Diagnostic): Promise<void> {
    if (!diagnostic.file || diagnostic.file === 'unknown') {
      return;
    }

    // Convert absolute path to vault-relative path
    const vaultPath = this.toVaultPath(diagnostic.file);
    if (!vaultPath) {
      console.warn(`File not in vault: ${diagnostic.file}`);
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!(file instanceof TFile)) {
      console.warn(`File not found: ${vaultPath}`);
      return;
    }

    // Open file
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);

    // Navigate to line if available
    if (diagnostic.line !== null) {
      const editor = this.app.workspace.activeEditor?.editor;
      if (editor) {
        const line = diagnostic.line - 1; // Convert to 0-indexed
        editor.setCursor({ line, ch: 0 });
        editor.scrollIntoView(
          { from: { line, ch: 0 }, to: { line, ch: 0 } },
          true
        );
      }
    }
  }

  /**
   * Convert absolute path to vault-relative path
   */
  private toVaultPath(absolutePath: string): string | null {
    if (!this.vaultBasePath) return null;

    const normalizedAbsolute = path.normalize(absolutePath);
    const normalizedBase = path.normalize(this.vaultBasePath);

    if (normalizedAbsolute.startsWith(normalizedBase)) {
      return normalizedAbsolute
        .substring(normalizedBase.length)
        .replace(/^[/\\]/, '') // Remove leading slash
        .replace(/\\/g, '/');   // Normalize to forward slashes
    }

    return null;
  }

  /**
   * Get a relative display path for a file
   */
  private getRelativePath(absolutePath: string): string {
    const vaultPath = this.toVaultPath(absolutePath);
    if (vaultPath) return vaultPath;

    // Fall back to just the filename
    return path.basename(absolutePath);
  }
}
