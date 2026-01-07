import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_PDF_PREVIEW } from '../constants';
import { SyncTeXParser, findSyncTeXFile, SourceLocation, PDFLocation } from '../utils/synctex';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Callback for reverse search (PDF → source navigation)
 */
export type ReverseSearchCallback = (location: SourceLocation) => void;

/**
 * PDF Preview panel view with SyncTeX support
 * Displays compiled PDF output and supports bidirectional navigation
 */
export class PDFPreviewView extends ItemView {
  private pdfPath: string | null = null;
  private projectRoot: string | null = null;
  private iframeEl: HTMLIFrameElement | null = null;
  private overlayEl: HTMLDivElement | null = null;
  private currentScale = 1.0;
  private currentPage = 1;
  private totalPages = 1;
  private syncTeXEnabled = false;
  private syncTeXParser: SyncTeXParser | null = null;
  private reverseSearchCallback: ReverseSearchCallback | null = null;
  private highlightEl: HTMLDivElement | null = null;
  private pageIndicatorEl: HTMLSpanElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.syncTeXParser = new SyncTeXParser();
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
   * Set the callback for reverse search
   */
  setReverseSearchCallback(callback: ReverseSearchCallback | null): void {
    this.reverseSearchCallback = callback;
  }

  /**
   * Load and display a PDF file
   * @param pdfPath Absolute path to the PDF
   * @param projectRoot Root directory of the LaTeX project
   */
  async loadPdf(pdfPath: string, projectRoot?: string): Promise<void> {
    // Verify file exists
    if (!fs.existsSync(pdfPath)) {
      this.showError(`PDF file not found: ${pdfPath}`);
      return;
    }

    this.pdfPath = pdfPath;
    this.projectRoot = projectRoot || path.dirname(pdfPath);

    // Try to load SyncTeX data
    await this.loadSyncTeX();

    this.render();
  }

  /**
   * Load SyncTeX data for the current PDF
   */
  private async loadSyncTeX(): Promise<void> {
    if (!this.pdfPath || !this.projectRoot) return;

    try {
      const synctexPath = await findSyncTeXFile(this.pdfPath);
      if (synctexPath) {
        await this.syncTeXParser?.load(synctexPath, this.projectRoot);
        this.syncTeXEnabled = this.syncTeXParser?.hasData() || false;
      } else {
        this.syncTeXEnabled = false;
      }
    } catch (error) {
      console.error('Failed to load SyncTeX data:', error);
      this.syncTeXEnabled = false;
    }
  }

  /**
   * Reload the current PDF (after recompilation)
   */
  async reload(): Promise<void> {
    if (this.pdfPath) {
      // Reload SyncTeX data
      await this.loadSyncTeX();
      this.render();
    }
  }

  /**
   * Clear the preview
   */
  clear(): void {
    this.pdfPath = null;
    this.projectRoot = null;
    this.syncTeXEnabled = false;
    this.render();
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.pdfPath = null;
    this.projectRoot = null;
  }

  /**
   * Perform forward search: navigate to PDF location from source
   * @param file Source file path
   * @param line Line number (1-indexed)
   * @returns true if navigation succeeded
   */
  forwardSearch(file: string, line: number): boolean {
    if (!this.syncTeXEnabled || !this.syncTeXParser) {
      return false;
    }

    const location = this.syncTeXParser.forwardSearch(file, line);
    if (!location) {
      return false;
    }

    // Navigate to the page
    this.goToPage(location.page);

    // Show highlight indicator
    this.showHighlight(location);

    return true;
  }

  /**
   * Navigate to a specific page
   */
  goToPage(page: number): void {
    this.currentPage = page;

    // Update iframe URL with page parameter
    if (this.iframeEl && this.pdfPath) {
      const timestamp = Date.now();
      // Most PDF viewers support #page=N fragment
      const pdfUrl = `file://${this.pdfPath}?t=${timestamp}#page=${page}`;
      this.iframeEl.src = pdfUrl;
    }

    // Update page indicator
    this.updatePageIndicator();
  }

  /**
   * Show a highlight indicator at the given PDF location
   */
  private showHighlight(location: PDFLocation): void {
    // For now, show a brief notification about the location
    // Full highlight would require PDF.js integration
    if (this.highlightEl) {
      this.highlightEl.style.display = 'block';
      this.highlightEl.textContent = `Line found on page ${location.page}`;

      // Auto-hide after 3 seconds
      setTimeout(() => {
        if (this.highlightEl) {
          this.highlightEl.style.display = 'none';
        }
      }, 3000);
    }
  }

  /**
   * Update the page indicator display
   */
  private updatePageIndicator(): void {
    if (this.pageIndicatorEl) {
      this.pageIndicatorEl.textContent = `Page ${this.currentPage}`;
    }
  }

  /**
   * Handle click on the SyncTeX overlay
   */
  private handleOverlayClick(event: MouseEvent): void {
    if (!this.syncTeXEnabled || !this.syncTeXParser || !this.reverseSearchCallback) {
      return;
    }

    const overlay = event.currentTarget as HTMLElement;
    const rect = overlay.getBoundingClientRect();

    // Calculate relative position (0-1)
    const relX = (event.clientX - rect.left) / rect.width;
    const relY = (event.clientY - rect.top) / rect.height;

    // Estimate PDF coordinates
    // Standard PDF page is 612x792 points (US Letter)
    // This is an approximation - exact mapping would require PDF.js
    const pageWidth = 612;
    const pageHeight = 792;

    const pdfX = relX * pageWidth;
    const pdfY = relY * pageHeight;

    // Perform reverse search
    const location = this.syncTeXParser.reverseSearch(this.currentPage, pdfX, pdfY);

    if (location) {
      this.reverseSearchCallback(location);
    }
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

    // SyncTeX indicator
    if (this.syncTeXEnabled) {
      const syncIndicator = toolbar.createSpan({
        cls: 'latex-pdf-synctex-indicator',
        text: '⇄',
        attr: { title: 'SyncTeX enabled - Ctrl+Click to jump to source' },
      });
      syncIndicator.style.marginLeft = '8px';
      syncIndicator.style.color = 'var(--text-accent)';
    }

    // Spacer
    toolbar.createDiv({ cls: 'latex-pdf-toolbar-spacer' });

    // Page indicator
    this.pageIndicatorEl = toolbar.createSpan({
      cls: 'latex-pdf-page-indicator',
      text: `Page ${this.currentPage}`,
    });
    this.pageIndicatorEl.style.marginRight = '8px';

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
      text: 'Open External',
    });
    openExternalBtn.addEventListener('click', () => this.openExternal());

    // PDF container
    const pdfContainer = container.createDiv({ cls: 'latex-pdf-container' });
    pdfContainer.style.position = 'relative';

    // Highlight indicator (for forward search)
    this.highlightEl = pdfContainer.createDiv({
      cls: 'latex-pdf-highlight',
    });
    this.highlightEl.style.cssText = `
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--text-accent);
      color: var(--background-primary);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 100;
      display: none;
    `;

    // Use file:// URL for local PDF
    // Add timestamp to force reload
    const timestamp = Date.now();
    const pdfUrl = `file://${this.pdfPath}?t=${timestamp}#page=${this.currentPage}`;

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

    // Create SyncTeX overlay for click handling
    if (this.syncTeXEnabled) {
      this.overlayEl = pdfContainer.createDiv({
        cls: 'latex-pdf-synctex-overlay',
      });
      this.overlayEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        cursor: crosshair;
        opacity: 0;
        z-index: 10;
        transition: opacity 0.2s;
      `;

      // Show overlay when Ctrl/Cmd is held
      const showOverlay = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && this.overlayEl) {
          this.overlayEl.style.opacity = '0.1';
          this.overlayEl.style.backgroundColor = 'var(--text-accent)';
        }
      };

      const hideOverlay = () => {
        if (this.overlayEl) {
          this.overlayEl.style.opacity = '0';
          this.overlayEl.style.backgroundColor = 'transparent';
        }
      };

      document.addEventListener('keydown', showOverlay);
      document.addEventListener('keyup', hideOverlay);

      // Handle clicks on overlay
      this.overlayEl.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          this.handleOverlayClick(e);
        }
      });

      // Add tooltip
      this.overlayEl.setAttribute('title', 'Ctrl+Click to jump to source');
    }
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

  /**
   * Check if SyncTeX is available for current PDF
   */
  isSyncTeXAvailable(): boolean {
    return this.syncTeXEnabled;
  }

  /**
   * Get current PDF path
   */
  getPdfPath(): string | null {
    return this.pdfPath;
  }

  /**
   * Get current page number
   */
  getCurrentPage(): number {
    return this.currentPage;
  }
}
