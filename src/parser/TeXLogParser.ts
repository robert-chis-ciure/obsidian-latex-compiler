import * as path from 'path';
import { Diagnostic } from '../types';
import * as patterns from './patterns';

/**
 * Parser for TeX/LaTeX log files
 * Extracts structured diagnostics from compiler output
 */
export class TeXLogParser {
  private showBadboxWarnings: boolean;

  constructor(options: { showBadboxWarnings?: boolean } = {}) {
    this.showBadboxWarnings = options.showBadboxWarnings ?? false;
  }

  /**
   * Parse a TeX log file and extract diagnostics
   * @param logContent Raw log file content
   * @param projectRoot Absolute path to project root for path resolution
   * @returns Array of parsed diagnostics
   */
  parse(logContent: string, projectRoot: string): Diagnostic[] {
    try {
      return this.parseStructured(logContent, projectRoot);
    } catch (error) {
      // Fallback: return single diagnostic with raw log
      console.error('TeX log parsing failed:', error);
      return [{
        severity: 'error',
        file: 'unknown',
        line: null,
        message: 'Log parsing failed - showing raw output',
        rawText: logContent.slice(0, 2000),
        code: 'PARSE_FAILED',
      }];
    }
  }

  /**
   * Parse structured diagnostics from log content
   */
  private parseStructured(logContent: string, projectRoot: string): Diagnostic[] {
    const lines = logContent.split('\n');
    const diagnostics: Diagnostic[] = [];
    const fileStack: string[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Track file context via parentheses
      this.updateFileStack(line, fileStack, projectRoot);

      // Check for main error (starts with "!")
      if (patterns.ERROR.test(line)) {
        const result = this.parseErrorBlock(lines, i, fileStack, projectRoot);
        if (result.diagnostic) {
          diagnostics.push(result.diagnostic);
        }
        i += result.linesConsumed;
        continue;
      }

      // Check for specific warning types BEFORE generic warning pattern
      // Check for undefined reference
      const undefinedRefMatch = line.match(patterns.UNDEFINED_REF);
      if (undefinedRefMatch) {
        diagnostics.push(this.parseUndefinedRef(line, undefinedRefMatch, fileStack));
        i++;
        continue;
      }

      // Check for undefined citation
      const undefinedCitationMatch = line.match(patterns.UNDEFINED_CITATION);
      if (undefinedCitationMatch) {
        diagnostics.push(this.parseUndefinedCitation(line, undefinedCitationMatch, fileStack));
        i++;
        continue;
      }

      // Check for class warning
      const classWarningMatch = line.match(patterns.CLASS_WARNING);
      if (classWarningMatch) {
        diagnostics.push(this.parseClassWarning(line, classWarningMatch, fileStack));
        i++;
        continue;
      }

      // Check for generic warning (after specific warning types)
      const warningMatch = line.match(patterns.WARNING);
      if (warningMatch) {
        const diagnostic = this.parseWarning(line, warningMatch, fileStack, projectRoot);
        if (diagnostic) {
          diagnostics.push(diagnostic);
        }
        i++;
        continue;
      }

      // Check for badbox warnings
      if (this.showBadboxWarnings) {
        const badboxMatch = line.match(patterns.BADBOX);
        if (badboxMatch) {
          diagnostics.push(this.parseBadbox(line, badboxMatch, fileStack));
          i++;
          continue;
        }
      }

      // Check for font warnings
      const fontWarningMatch = line.match(patterns.FONT_WARNING);
      if (fontWarningMatch) {
        diagnostics.push({
          severity: 'info',
          file: this.getCurrentFile(fileStack),
          line: null,
          message: `Font: ${fontWarningMatch[1]}`,
          rawText: line,
          code: 'FONT_WARNING',
        });
        i++;
        continue;
      }

      // Check for file:line:error format (from -file-line-error flag)
      const fileLineErrorMatch = line.match(patterns.FILE_LINE_ERROR);
      if (fileLineErrorMatch) {
        const filePath = fileLineErrorMatch[1];
        const lineNum = parseInt(fileLineErrorMatch[2], 10);
        const message = fileLineErrorMatch[3];

        // Skip if this looks like a path rather than an error
        if (message && !filePath.includes(' ')) {
          diagnostics.push({
            severity: 'error',
            file: this.resolvePath(filePath, projectRoot) || filePath,
            line: lineNum,
            message: message.trim(),
            rawText: line,
            code: 'FILE_LINE_ERROR',
          });
          i++;
          continue;
        }
      }

      // Check for BibTeX citation not found
      const bibtexCitationMatch = line.match(patterns.BIBTEX_CITATION_NOT_FOUND);
      if (bibtexCitationMatch) {
        diagnostics.push({
          severity: 'warning',
          file: this.getCurrentFile(fileStack),
          line: null,
          message: `BibTeX: Citation '${bibtexCitationMatch[1]}' not found in database`,
          rawText: line,
          code: 'BIBTEX_CITATION_NOT_FOUND',
        });
        i++;
        continue;
      }

      // Check for BibTeX missing field
      const bibtexMissingFieldMatch = line.match(patterns.BIBTEX_MISSING_FIELD);
      if (bibtexMissingFieldMatch) {
        diagnostics.push({
          severity: 'warning',
          file: this.getCurrentFile(fileStack),
          line: null,
          message: `BibTeX: Empty ${bibtexMissingFieldMatch[1]} field in '${bibtexMissingFieldMatch[2]}'`,
          rawText: line,
          code: 'BIBTEX_MISSING_FIELD',
        });
        i++;
        continue;
      }

      // Check for BibTeX file error
      const bibtexErrorMatch = line.match(patterns.BIBTEX_ERROR);
      if (bibtexErrorMatch) {
        diagnostics.push({
          severity: 'error',
          file: this.getCurrentFile(fileStack),
          line: null,
          message: `BibTeX: Couldn't open ${bibtexErrorMatch[1]}`,
          rawText: line,
          code: 'BIBTEX_ERROR',
        });
        i++;
        continue;
      }

      // Check for Biber error
      const biberErrorMatch = line.match(patterns.BIBER_ERROR);
      if (biberErrorMatch) {
        diagnostics.push({
          severity: 'error',
          file: this.getCurrentFile(fileStack),
          line: null,
          message: `Biber: ${biberErrorMatch[1]}`,
          rawText: line,
          code: 'BIBER_ERROR',
        });
        i++;
        continue;
      }

      // Check for Biber warning
      const biberWarningMatch = line.match(patterns.BIBER_WARNING);
      if (biberWarningMatch) {
        diagnostics.push({
          severity: 'warning',
          file: this.getCurrentFile(fileStack),
          line: null,
          message: `Biber: ${biberWarningMatch[1]}`,
          rawText: line,
          code: 'BIBER_WARNING',
        });
        i++;
        continue;
      }

      i++;
    }

    return diagnostics;
  }

  /**
   * Track current file context by parsing parentheses in log
   */
  private updateFileStack(line: string, fileStack: string[], projectRoot: string): void {
    // This is a simplified version - TeX logs use ( and ) to indicate file entry/exit
    // but the format is complex. We look for file paths after opening parens.

    let match: RegExpExecArray | null;
    const fileOpenRegex = new RegExp(patterns.FILE_OPEN.source, 'gi');

    while ((match = fileOpenRegex.exec(line)) !== null) {
      const filePath = match[1];
      const resolvedPath = this.resolvePath(filePath, projectRoot);
      if (resolvedPath) {
        fileStack.push(resolvedPath);
      }
    }

    // Count closing parens (simplified - doesn't handle all edge cases)
    const openParens = (line.match(/\(/g) || []).length;
    const closeParens = (line.match(/\)/g) || []).length;
    const netClose = closeParens - openParens;

    for (let j = 0; j < netClose && fileStack.length > 0; j++) {
      fileStack.pop();
    }
  }

  /**
   * Parse an error block starting with "!"
   */
  private parseErrorBlock(
    lines: string[],
    startIndex: number,
    fileStack: string[],
    _projectRoot: string
  ): { diagnostic: Diagnostic | null; linesConsumed: number } {
    const errorLine = lines[startIndex];
    let lineNumber: number | null = null;
    let context: string[] = [errorLine];
    let i = startIndex + 1;
    let code: string | undefined;

    // Extract error message
    const errorMatch = errorLine.match(patterns.ERROR);
    let message = errorMatch ? errorMatch[1] : errorLine;

    // Check for specific error types
    if (patterns.MISSING_FILE.test(errorLine)) {
      const match = errorLine.match(patterns.MISSING_FILE);
      if (match) {
        code = 'MISSING_FILE';
        message = `File '${match[1]}' not found`;
      }
    } else if (patterns.MISSING_PACKAGE.test(errorLine)) {
      const match = errorLine.match(patterns.MISSING_PACKAGE);
      if (match) {
        code = 'MISSING_PACKAGE';
        message = `Package '${match[1]}' not found`;
      }
    } else if (patterns.UNDEFINED_CONTROL.test(errorLine)) {
      code = 'UNDEFINED_CONTROL';
    } else if (patterns.PACKAGE_ERROR.test(errorLine)) {
      const match = errorLine.match(patterns.PACKAGE_ERROR);
      if (match) {
        code = `PACKAGE_${match[1].toUpperCase()}_ERROR`;
        message = `Package ${match[1]}: ${match[2]}`;
      }
    } else if (patterns.CLASS_ERROR.test(errorLine)) {
      const match = errorLine.match(patterns.CLASS_ERROR);
      if (match) {
        code = `CLASS_${match[1].toUpperCase()}_ERROR`;
        message = `Class ${match[1]}: ${match[2]}`;
      }
    }

    // Check for shell-escape requirement
    if (patterns.SHELL_ESCAPE_REQUIRED.test(errorLine)) {
      code = 'SHELL_ESCAPE_REQUIRED';
    }

    // Accumulate context lines until we find line number or blank line
    const maxLook = Math.min(startIndex + 10, lines.length);
    while (i < maxLook) {
      const currentLine = lines[i];

      // Check for line number
      const lineNumMatch = currentLine.match(patterns.LINE_NUMBER);
      if (lineNumMatch) {
        lineNumber = parseInt(lineNumMatch[1], 10);
        context.push(currentLine);
        i++;
        break;
      }

      // Stop at blank line or next error
      if (currentLine.trim() === '' || patterns.ERROR.test(currentLine)) {
        break;
      }

      // Check for shell-escape in context
      if (patterns.SHELL_ESCAPE_REQUIRED.test(currentLine)) {
        code = 'SHELL_ESCAPE_REQUIRED';
        message = 'Shell-escape required for this package';
      }

      context.push(currentLine);
      i++;
    }

    const diagnostic: Diagnostic = {
      severity: 'error',
      file: this.getCurrentFile(fileStack),
      line: lineNumber,
      message: message.trim(),
      rawText: context.join('\n'),
      code,
    };

    return {
      diagnostic,
      linesConsumed: i - startIndex,
    };
  }

  /**
   * Parse a LaTeX/Package warning
   */
  private parseWarning(
    line: string,
    match: RegExpMatchArray,
    fileStack: string[],
    _projectRoot: string
  ): Diagnostic | null {
    const packageName = match[1];
    const message = match[2];

    // Extract line number if present
    const lineMatch = line.match(patterns.INPUT_LINE);
    const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : null;

    return {
      severity: 'warning',
      file: this.getCurrentFile(fileStack),
      line: lineNumber,
      message: packageName ? `Package ${packageName}: ${message}` : message,
      rawText: line,
      code: packageName ? `PACKAGE_${packageName.toUpperCase()}_WARNING` : 'LATEX_WARNING',
    };
  }

  /**
   * Parse a class warning
   */
  private parseClassWarning(
    line: string,
    match: RegExpMatchArray,
    fileStack: string[]
  ): Diagnostic {
    const className = match[1];
    const message = match[2];
    const lineMatch = line.match(patterns.INPUT_LINE);
    const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : null;

    return {
      severity: 'warning',
      file: this.getCurrentFile(fileStack),
      line: lineNumber,
      message: `Class ${className}: ${message}`,
      rawText: line,
      code: `CLASS_${className.toUpperCase()}_WARNING`,
    };
  }

  /**
   * Parse an undefined reference warning
   */
  private parseUndefinedRef(
    line: string,
    match: RegExpMatchArray,
    fileStack: string[]
  ): Diagnostic {
    const refName = match[1];
    const lineMatch = line.match(patterns.INPUT_LINE);
    const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : null;

    return {
      severity: 'warning',
      file: this.getCurrentFile(fileStack),
      line: lineNumber,
      message: `Undefined reference '${refName}'`,
      rawText: line,
      code: 'UNDEFINED_REFERENCE',
    };
  }

  /**
   * Parse an undefined citation warning
   */
  private parseUndefinedCitation(
    line: string,
    match: RegExpMatchArray,
    fileStack: string[]
  ): Diagnostic {
    const citationKey = match[1];
    const lineMatch = line.match(patterns.INPUT_LINE);
    const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : null;

    return {
      severity: 'warning',
      file: this.getCurrentFile(fileStack),
      line: lineNumber,
      message: `Undefined citation '${citationKey}'`,
      rawText: line,
      code: 'UNDEFINED_CITATION',
    };
  }

  /**
   * Parse a badbox warning
   */
  private parseBadbox(
    line: string,
    match: RegExpMatchArray,
    fileStack: string[]
  ): Diagnostic {
    const type = match[1]; // Over or Under
    const boxType = match[2]; // h or v
    const amount = match[3]; // e.g., "15.2pt too wide"
    const lineStart = parseInt(match[4], 10);

    const boxName = boxType === 'h' ? 'hbox' : 'vbox';

    return {
      severity: 'info',
      file: this.getCurrentFile(fileStack),
      line: lineStart,
      message: `${type}full \\${boxName} (${amount})`,
      rawText: line,
      code: `${type.toUpperCase()}FULL_${boxName.toUpperCase()}`,
    };
  }

  /**
   * Get the current file from the stack, or 'unknown'
   */
  private getCurrentFile(fileStack: string[]): string {
    return fileStack.length > 0 ? fileStack[fileStack.length - 1] : 'unknown';
  }

  /**
   * Resolve a potentially relative path to absolute
   */
  private resolvePath(filePath: string, projectRoot: string): string | null {
    if (!filePath) return null;

    // Clean up the path
    filePath = filePath.trim();

    // If already absolute, return as-is
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Resolve relative to project root
    return path.resolve(projectRoot, filePath);
  }
}
