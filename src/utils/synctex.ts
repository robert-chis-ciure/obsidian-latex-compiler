import * as zlib from 'zlib';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Represents a location in a source file
 */
export interface SourceLocation {
  /** Absolute path to the source file */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed, optional) */
  column?: number;
}

/**
 * Represents a location in a PDF
 */
export interface PDFLocation {
  /** Page number (1-indexed) */
  page: number;
  /** X coordinate in PDF points */
  x: number;
  /** Y coordinate in PDF points */
  y: number;
  /** Width of the element */
  width?: number;
  /** Height of the element */
  height?: number;
}

/**
 * A mapping entry between source and PDF locations
 */
interface SyncTeXEntry {
  file: string;
  line: number;
  column: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * SyncTeX parser for bidirectional navigation between PDF and source
 *
 * SyncTeX file format reference:
 * - Header: SyncTeX Version:1
 * - Input sections: Input:n:filename
 * - Content sections with records: { [ ( ) ] } h v W H
 */
export class SyncTeXParser {
  private entries: SyncTeXEntry[] = [];
  private inputFiles: Map<number, string> = new Map();
  private projectRoot: string = '';
  private outputDir: string = '';
  private magnification: number = 1000;
  private unit: number = 1;
  private xOffset: number = 0;
  private yOffset: number = 0;

  /**
   * Load and parse a SyncTeX file
   * @param synctexPath Path to .synctex.gz or .synctex file
   * @param projectRoot Root directory of the LaTeX project
   */
  async load(synctexPath: string, projectRoot: string): Promise<void> {
    this.projectRoot = projectRoot;
    this.outputDir = path.dirname(synctexPath);
    this.entries = [];
    this.inputFiles.clear();

    let content: string;

    // Handle both .synctex.gz and .synctex files
    if (synctexPath.endsWith('.gz')) {
      const compressed = await fs.readFile(synctexPath);
      const decompressed = zlib.gunzipSync(compressed);
      content = decompressed.toString('utf-8');
    } else {
      content = await fs.readFile(synctexPath, 'utf-8');
    }

    this.parse(content);
  }

  /**
   * Parse SyncTeX content
   */
  private parse(content: string): void {
    const lines = content.split('\n');

    let currentPage = 0;
    let currentFile = 0;
    let currentLine = 0;
    let currentColumn = 0;
    let currentX = 0;
    let currentY = 0;
    let currentWidth = 0;
    let currentHeight = 0;

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;

      // Parse header values
      if (line.startsWith('Magnification:')) {
        this.magnification = parseInt(line.substring(14), 10) || 1000;
        continue;
      }
      if (line.startsWith('Unit:')) {
        this.unit = parseInt(line.substring(5), 10) || 1;
        continue;
      }
      if (line.startsWith('X Offset:')) {
        this.xOffset = parseInt(line.substring(9), 10) || 0;
        continue;
      }
      if (line.startsWith('Y Offset:')) {
        this.yOffset = parseInt(line.substring(9), 10) || 0;
        continue;
      }

      // Parse input file declarations
      if (line.startsWith('Input:')) {
        const match = line.match(/^Input:(\d+):(.+)$/);
        if (match) {
          const fileId = parseInt(match[1], 10);
          let filePath = match[2];

          // Resolve relative paths
          if (!path.isAbsolute(filePath)) {
            // Try relative to output dir first
            const fromOutput = path.resolve(this.outputDir, filePath);
            const fromRoot = path.resolve(this.projectRoot, filePath);

            // Check which exists
            if (filePath.startsWith('./') || filePath.startsWith('../')) {
              filePath = fromOutput;
            } else {
              filePath = fromRoot;
            }
          }

          this.inputFiles.set(fileId, filePath);
        }
        continue;
      }

      // Parse page marker
      if (line.startsWith('{')) {
        const pageMatch = line.match(/^\{(\d+)$/);
        if (pageMatch) {
          currentPage = parseInt(pageMatch[1], 10);
        }
        continue;
      }

      // Parse vertical/horizontal records
      // Format: h<file>,<line>,<column>:<x>,<y>
      // or: v<file>,<line>,<column>:<x>,<y>
      // or more complex: h<file>,<line>,<column>:<x>,<y>,<w>,<h>
      const recordMatch = line.match(/^([hvxkgf$\[\]()!])(-?\d+),(-?\d+),(-?\d+):(-?\d+),(-?\d+)(?:,(-?\d+),(-?\d+))?/);
      if (recordMatch) {
        const type = recordMatch[1];
        currentFile = parseInt(recordMatch[2], 10);
        currentLine = parseInt(recordMatch[3], 10);
        currentColumn = parseInt(recordMatch[4], 10);
        currentX = parseInt(recordMatch[5], 10);
        currentY = parseInt(recordMatch[6], 10);
        if (recordMatch[7]) currentWidth = parseInt(recordMatch[7], 10);
        if (recordMatch[8]) currentHeight = parseInt(recordMatch[8], 10);

        // Only record certain types (h = horizontal, v = vertical, x = current, k = kern)
        if ('hvxk'.includes(type) && currentPage > 0) {
          const filePath = this.inputFiles.get(currentFile);
          if (filePath && currentLine > 0) {
            this.entries.push({
              file: filePath,
              line: currentLine,
              column: currentColumn,
              page: currentPage,
              x: this.convertX(currentX),
              y: this.convertY(currentY),
              width: this.convertUnit(currentWidth),
              height: this.convertUnit(currentHeight),
            });
          }
        }
        continue;
      }

      // Handle shorthand records that reference previous values
      // Format: x<x>,<y>
      const shortMatch = line.match(/^x(-?\d+),(-?\d+)/);
      if (shortMatch && currentFile > 0 && currentLine > 0 && currentPage > 0) {
        currentX = parseInt(shortMatch[1], 10);
        currentY = parseInt(shortMatch[2], 10);

        const filePath = this.inputFiles.get(currentFile);
        if (filePath) {
          this.entries.push({
            file: filePath,
            line: currentLine,
            column: currentColumn,
            page: currentPage,
            x: this.convertX(currentX),
            y: this.convertY(currentY),
            width: this.convertUnit(currentWidth),
            height: this.convertUnit(currentHeight),
          });
        }
      }
    }
  }

  /**
   * Convert SyncTeX x coordinate to PDF points
   */
  private convertX(x: number): number {
    return (x + this.xOffset) * this.unit / this.magnification;
  }

  /**
   * Convert SyncTeX y coordinate to PDF points
   */
  private convertY(y: number): number {
    return (y + this.yOffset) * this.unit / this.magnification;
  }

  /**
   * Convert SyncTeX unit to PDF points
   */
  private convertUnit(value: number): number {
    return value * this.unit / this.magnification;
  }

  /**
   * Forward search: Find PDF location from source location
   * @param file Source file path
   * @param line Line number (1-indexed)
   * @param column Column number (optional)
   * @returns PDF location or null if not found
   */
  forwardSearch(file: string, line: number, column?: number): PDFLocation | null {
    // Normalize the file path
    const normalizedFile = path.resolve(file);

    // Find entries matching the file and line
    const candidates = this.entries.filter(e => {
      const entryFile = path.resolve(e.file);
      return entryFile === normalizedFile && e.line === line;
    });

    if (candidates.length === 0) {
      // Try to find the closest line in the same file
      const fileEntries = this.entries.filter(e =>
        path.resolve(e.file) === normalizedFile
      );

      if (fileEntries.length === 0) return null;

      // Find closest line
      let closest = fileEntries[0];
      let minDiff = Math.abs(closest.line - line);

      for (const entry of fileEntries) {
        const diff = Math.abs(entry.line - line);
        if (diff < minDiff) {
          minDiff = diff;
          closest = entry;
        }
      }

      // Only use if within 5 lines
      if (minDiff > 5) return null;

      return {
        page: closest.page,
        x: closest.x,
        y: closest.y,
        width: closest.width,
        height: closest.height,
      };
    }

    // If column is specified, try to find exact match
    if (column !== undefined) {
      const exact = candidates.find(e => e.column === column);
      if (exact) {
        return {
          page: exact.page,
          x: exact.x,
          y: exact.y,
          width: exact.width,
          height: exact.height,
        };
      }
    }

    // Return the first candidate
    const entry = candidates[0];
    return {
      page: entry.page,
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
    };
  }

  /**
   * Reverse search: Find source location from PDF location
   * @param page Page number (1-indexed)
   * @param x X coordinate in PDF points
   * @param y Y coordinate in PDF points
   * @returns Source location or null if not found
   */
  reverseSearch(page: number, x: number, y: number): SourceLocation | null {
    // Find entries on the same page
    const pageEntries = this.entries.filter(e => e.page === page);

    if (pageEntries.length === 0) return null;

    // Find the closest entry by distance
    let closest = pageEntries[0];
    let minDistance = this.distance(closest.x, closest.y, x, y);

    for (const entry of pageEntries) {
      const dist = this.distance(entry.x, entry.y, x, y);
      if (dist < minDistance) {
        minDistance = dist;
        closest = entry;
      }
    }

    // If too far away (more than 100 points), return null
    if (minDistance > 100) return null;

    return {
      file: closest.file,
      line: closest.line,
      column: closest.column > 0 ? closest.column : undefined,
    };
  }

  /**
   * Calculate Euclidean distance between two points
   */
  private distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  /**
   * Get all input files found in the SyncTeX data
   */
  getInputFiles(): string[] {
    return Array.from(this.inputFiles.values());
  }

  /**
   * Check if data has been loaded
   */
  hasData(): boolean {
    return this.entries.length > 0;
  }

  /**
   * Get number of entries
   */
  getEntryCount(): number {
    return this.entries.length;
  }
}

/**
 * Find the SyncTeX file for a given PDF
 * @param pdfPath Path to the PDF file
 * @returns Path to synctex file or null if not found
 */
export async function findSyncTeXFile(pdfPath: string): Promise<string | null> {
  const basename = pdfPath.replace(/\.pdf$/i, '');

  // Try different possible extensions
  const candidates = [
    `${basename}.synctex.gz`,
    `${basename}.synctex`,
    `${basename}.synctex(busy)`,
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // File doesn't exist, try next
    }
  }

  return null;
}
