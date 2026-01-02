import { setIcon } from 'obsidian';
import { BuildResult } from '../types';

export type BuildStatus = 'idle' | 'building' | 'success' | 'error' | 'watching';

/**
 * Status bar item for showing build status
 */
export class StatusBarItem {
  private element: HTMLElement;
  private status: BuildStatus = 'idle';
  private errorCount = 0;
  private warningCount = 0;

  constructor(statusBarEl: HTMLElement) {
    this.element = statusBarEl.createDiv({ cls: 'latex-status-bar-item' });
    this.render();
  }

  /**
   * Set status to building
   */
  setBuilding(): void {
    this.status = 'building';
    this.render();
  }

  /**
   * Set status based on build result
   */
  setBuildResult(result: BuildResult): void {
    this.status = result.success ? 'success' : 'error';
    this.errorCount = result.diagnostics.filter(d => d.severity === 'error').length;
    this.warningCount = result.diagnostics.filter(d => d.severity === 'warning').length;
    this.render();
  }

  /**
   * Reset to idle state
   */
  setIdle(): void {
    this.status = 'idle';
    this.errorCount = 0;
    this.warningCount = 0;
    this.render();
  }

  /**
   * Set status to watching
   */
  setWatching(): void {
    this.status = 'watching';
    this.render();
  }

  /**
   * Get the element for click handling
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Render the status bar item
   */
  private render(): void {
    this.element.empty();
    this.element.removeClass('idle', 'building', 'success', 'error', 'watching');
    this.element.addClass(this.status);

    // Icon
    const iconEl = this.element.createSpan({ cls: 'latex-status-icon' });

    switch (this.status) {
      case 'idle':
        setIcon(iconEl, 'file-code');
        this.element.createSpan({ text: ' LaTeX: Idle' });
        break;

      case 'building':
        setIcon(iconEl, 'loader');
        iconEl.addClass('spinning');
        this.element.createSpan({ text: ' LaTeX: Building...' });
        break;

      case 'success':
        setIcon(iconEl, 'check-circle');
        if (this.warningCount > 0) {
          this.element.createSpan({ text: ` LaTeX: OK (${this.warningCount} warning${this.warningCount !== 1 ? 's' : ''})` });
        } else {
          this.element.createSpan({ text: ' LaTeX: OK' });
        }
        break;

      case 'error':
        setIcon(iconEl, 'x-circle');
        this.element.createSpan({ text: ` LaTeX: ${this.errorCount} error${this.errorCount !== 1 ? 's' : ''}` });
        break;

      case 'watching':
        setIcon(iconEl, 'eye');
        this.element.createSpan({ text: ' LaTeX: Watching' });
        break;
    }
  }

  /**
   * Remove the status bar item
   */
  remove(): void {
    this.element.remove();
  }
}
