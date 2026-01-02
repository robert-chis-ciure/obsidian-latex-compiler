import { Diagnostic } from '../types';

/**
 * Diagnostic suggestions based on error codes
 */
const SUGGESTIONS: Record<string, string> = {
  MISSING_PACKAGE: 'Install with: tlmgr install <package-name>',
  MISSING_FILE: 'Check that the file exists and the path is correct',
  UNDEFINED_CONTROL: 'Check for typos in command name or missing \\usepackage',
  UNDEFINED_REFERENCE: 'Run compilation again to update references, or check the label exists',
  UNDEFINED_CITATION: 'Check that this key exists in your .bib file',
  SHELL_ESCAPE_REQUIRED: 'Enable shell-escape in plugin settings (security risk!)',
  OVERFULL_HBOX: 'Consider rewording or allowing hyphenation',
  UNDERFULL_HBOX: 'Consider adjusting text or using \\hfill',
  OVERFULL_VBOX: 'Adjust page breaks or content length',
  UNDERFULL_VBOX: 'Adjust page breaks or add content',
};

/**
 * Get a suggestion for a diagnostic based on its code
 */
export function getSuggestion(diagnostic: Diagnostic): string | null {
  if (!diagnostic.code) return null;
  return SUGGESTIONS[diagnostic.code] || null;
}

/**
 * Enhance diagnostics with suggestions
 */
export function enhanceDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.map((d) => {
    const suggestion = getSuggestion(d);
    if (suggestion) {
      return {
        ...d,
        message: `${d.message}\n${suggestion}`,
      };
    }
    return d;
  });
}

/**
 * Group diagnostics by file
 */
export function groupByFile(diagnostics: Diagnostic[]): Map<string, Diagnostic[]> {
  const grouped = new Map<string, Diagnostic[]>();

  for (const d of diagnostics) {
    const file = d.file || 'unknown';
    if (!grouped.has(file)) {
      grouped.set(file, []);
    }
    grouped.get(file)!.push(d);
  }

  return grouped;
}

/**
 * Sort diagnostics by severity (errors first) then by line number
 */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const severityOrder = { error: 0, warning: 1, info: 2 };

  return [...diagnostics].sort((a, b) => {
    // Sort by severity first
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // Then by file
    if (a.file !== b.file) {
      return (a.file || '').localeCompare(b.file || '');
    }

    // Then by line number
    const lineA = a.line ?? Infinity;
    const lineB = b.line ?? Infinity;
    return lineA - lineB;
  });
}

/**
 * Get summary counts of diagnostics
 */
export function getDiagnosticCounts(diagnostics: Diagnostic[]): {
  errors: number;
  warnings: number;
  info: number;
} {
  return {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    info: diagnostics.filter((d) => d.severity === 'info').length,
  };
}
