import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_PDF_PREVIEW } from '../constants';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PDF Preview panel view
 * Displays compiled PDF output using an iframe (leverages Obsidian's PDF capabilities)
 */
export class PDFPreviewView extends ItemView {
  private pdfPath: string | null = null;
  private iframeEl: HTMLIFrameElement | null = null;
  private currentScale = 1.0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PDF_PREVIEW;
  }

  getDisplayText(): string {
    return 'LaTeX PDF Preview';
  }

  getIcon(): string {
    return 'file-text';
  }

  /**
   * Load and display a PDF file
   */
  async loadPdf(pdfPath: string): Promise<void> {
    // Verify file exists
    if (!fs.existsSync(pdfPath)) {
      this.showError(`PDF file not found: ${pdfPath}`);
      return;
    }

    this.pdfPath = pdfPath;
    this.render();
  }

  /**
   * Reload the current PDF (after recompilation)
   */
  reload(): void {
    if (this.pdfPath) {
      this.render();
    }
  }

  /**
   * Clear the preview
   */
  clear(): void {
    this.pdfPath = null;
    this.render();
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.pdfPath = null;
  }

  /**
   * Render the PDF preview
   */
  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('latex-pdf-preview-container');

    if (!this.pdfPath) {
      container.createDiv({
        cls: 'latex-pdf-placeholder',
        text: 'No PDF to display. Compile a LaTeX project first.',
      });
      return;
    }

    // Create toolbar
    const toolbar = container.createDiv({ cls: 'latex-pdf-toolbar' });

    // File name display
    toolbar.createSpan({
      cls: 'latex-pdf-filename',
      text: path.basename(this.pdfPath),
    });

    // Spacer
    toolbar.createDiv({ cls: 'latex-pdf-toolbar-spacer' });

    // Zoom controls
    const zoomControls = toolbar.createDiv({ cls: 'latex-pdf-zoom-controls' });

    const zoomOutBtn = zoomControls.createEl('button', { text: '-' });
    zoomOutBtn.addEventListener('click', () => this.zoom(-0.1));

    const zoomLabel = zoomControls.createSpan({
      cls: 'latex-pdf-zoom-label',
      text: `${Math.round(this.currentScale * 100)}%`,
    });

    const zoomInBtn = zoomControls.createEl('button', { text: '+' });
    zoomInBtn.addEventListener('click', () => this.zoom(0.1));

    const resetBtn = zoomControls.createEl('button', { text: 'Reset' });
    resetBtn.addEventListener('click', () => this.resetZoom());

    // Open external button
    const openExternalBtn = toolbar.createEl('button', {
      cls: 'latex-pdf-external-btn',
      text: 'Open in System Viewer',
    });
    openExternalBtn.addEventListener('click', () => this.openExternal());

    // PDF container
    const pdfContainer = container.createDiv({ cls: 'latex-pdf-container' });

    // Use file:// URL for local PDF
    // Add timestamp to force reload
    const timestamp = Date.now();
    const pdfUrl = `file://${this.pdfPath}?t=${timestamp}`;

    // Create iframe for PDF display
    // Note: This uses the browser's built-in PDF viewer
    this.iframeEl = pdfContainer.createEl('iframe', {
      cls: 'latex-pdf-iframe',
      attr: {
        src: pdfUrl,
        type: 'application/pdf',
      },
    });

    this.iframeEl.style.transform = `scale(${this.currentScale})`;
    this.iframeEl.style.transformOrigin = 'top left';
    this.iframeEl.style.width = `${100 / this.currentScale}%`;
    this.iframeEl.style.height = `${100 / this.currentScale}%`;
  }

  /**
   * Zoom the PDF preview
   */
  private zoom(delta: number): void {
    this.currentScale = Math.max(0.5, Math.min(3.0, this.currentScale + delta));
    if (this.iframeEl) {
      this.iframeEl.style.transform = `scale(${this.currentScale})`;
      this.iframeEl.style.width = `${100 / this.currentScale}%`;
      this.iframeEl.style.height = `${100 / this.currentScale}%`;
    }
    // Update zoom label
    const label = this.containerEl.querySelector('.latex-pdf-zoom-label');
    if (label) {
      label.textContent = `${Math.round(this.currentScale * 100)}%`;
    }
  }

  /**
   * Reset zoom to 100%
   */
  private resetZoom(): void {
    this.currentScale = 1.0;
    if (this.iframeEl) {
      this.iframeEl.style.transform = 'scale(1)';
      this.iframeEl.style.width = '100%';
      this.iframeEl.style.height = '100%';
    }
    const label = this.containerEl.querySelector('.latex-pdf-zoom-label');
    if (label) {
      label.textContent = '100%';
    }
  }

  /**
   * Open PDF in system default viewer
   */
  private async openExternal(): Promise<void> {
    if (!this.pdfPath) return;

    // Use Electron's shell.openPath
    const { shell } = require('electron');
    await shell.openPath(this.pdfPath);
  }

  /**
   * Show an error message
   */
  private showError(message: string): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.createDiv({
      cls: 'latex-pdf-error',
      text: message,
    });
  }
}
