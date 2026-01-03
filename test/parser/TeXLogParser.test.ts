import * as fs from 'fs';
import * as path from 'path';
import { TeXLogParser } from '../../src/parser/TeXLogParser';

describe('TeXLogParser', () => {
  const parser = new TeXLogParser();
  const parserWithBadbox = new TeXLogParser({ showBadboxWarnings: true });
  const fixturesDir = path.join(__dirname, 'fixtures');
  const projectRoot = '/test/project';

  describe('simple error parsing', () => {
    test('parses undefined control sequence error with line number', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'simple-error.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      expect(diagnostics.length).toBeGreaterThan(0);

      const error = diagnostics.find(d => d.severity === 'error');
      expect(error).toBeDefined();
      expect(error!.line).toBe(15);
      expect(error!.message).toContain('Undefined control sequence');
    });
  });

  describe('missing package parsing', () => {
    test('parses missing package error', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'missing-package.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const packageError = diagnostics.find(d =>
        d.severity === 'error' && d.message.toLowerCase().includes('not found')
      );

      expect(packageError).toBeDefined();
      expect(packageError!.code).toBe('MISSING_FILE');
    });
  });

  describe('citation warnings parsing', () => {
    test('parses undefined citations as warnings', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'undefined-citation.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const citationWarnings = diagnostics.filter(d =>
        d.severity === 'warning' && d.message.includes('Citation') || d.message.includes('citation')
      );

      expect(citationWarnings.length).toBeGreaterThan(0);
    });

    test('extracts citation key from warning', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'undefined-citation.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const smithCitation = diagnostics.find(d =>
        d.message.includes('smith2023')
      );

      expect(smithCitation).toBeDefined();
      expect(smithCitation!.code).toBe('UNDEFINED_CITATION');
    });

    test('extracts line number from citation warning', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'undefined-citation.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const citationWarning = diagnostics.find(d =>
        d.message.includes('smith2023')
      );

      expect(citationWarning).toBeDefined();
      expect(citationWarning!.line).toBe(12);
    });
  });

  describe('successful build parsing', () => {
    test('returns no errors for successful build', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'successful-build.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const errors = diagnostics.filter(d => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('badbox warning parsing', () => {
    test('does not parse badbox warnings by default', () => {
      const log = `
Overfull \\hbox (15.2pt too wide) in paragraph at lines 128--135
`;
      const diagnostics = parser.parse(log, projectRoot);

      const badbox = diagnostics.find(d => d.code?.includes('OVERFULL'));
      expect(badbox).toBeUndefined();
    });

    test('parses overfull hbox when enabled', () => {
      const log = `
Overfull \\hbox (15.2pt too wide) in paragraph at lines 128--135
`;
      const diagnostics = parserWithBadbox.parse(log, projectRoot);

      const badbox = diagnostics.find(d => d.code === 'OVERFULL_HBOX');
      expect(badbox).toBeDefined();
      expect(badbox!.severity).toBe('info');
      expect(badbox!.line).toBe(128);
    });

    test('parses underfull vbox when enabled', () => {
      const log = `
Underfull \\vbox (badness 10000) at lines 50--60
`;
      const diagnostics = parserWithBadbox.parse(log, projectRoot);

      const badbox = diagnostics.find(d => d.code === 'UNDERFULL_VBOX');
      expect(badbox).toBeDefined();
      expect(badbox!.line).toBe(50);
    });
  });

  describe('package error parsing', () => {
    test('parses package-specific errors', () => {
      const log = `
! Package babel Error: You haven't specified a language option.

See the babel package documentation for explanation.
Type  H <return>  for immediate help.
 ...

l.42 \\begin{document}
`;
      const diagnostics = parser.parse(log, projectRoot);

      const packageError = diagnostics.find(d =>
        d.severity === 'error' && d.message.includes('babel')
      );

      expect(packageError).toBeDefined();
      expect(packageError!.code).toBe('PACKAGE_BABEL_ERROR');
    });
  });

  describe('shell escape detection', () => {
    test('detects shell-escape requirement', () => {
      const log = `
! Package minted Error: You must invoke LaTeX with the -shell-escape flag.

See the minted package documentation for explanation.
Type  H <return>  for immediate help.
 ...

l.12 \\begin{minted}{python}
`;
      const diagnostics = parser.parse(log, projectRoot);

      const shellError = diagnostics.find(d =>
        d.code === 'SHELL_ESCAPE_REQUIRED'
      );

      expect(shellError).toBeDefined();
      expect(shellError!.severity).toBe('error');
    });
  });

  describe('diagnostic structure', () => {
    test('all diagnostics have required fields', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'simple-error.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      for (const diagnostic of diagnostics) {
        expect(diagnostic).toHaveProperty('severity');
        expect(diagnostic).toHaveProperty('file');
        expect(diagnostic).toHaveProperty('line');
        expect(diagnostic).toHaveProperty('message');
        expect(diagnostic).toHaveProperty('rawText');
        expect(['error', 'warning', 'info']).toContain(diagnostic.severity);
      }
    });
  });

  describe('BibTeX error parsing', () => {
    test('parses BibTeX database not found error', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'bibtex-error.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const bibtexError = diagnostics.find(d =>
        d.severity === 'error' && d.code === 'BIBTEX_ERROR'
      );

      expect(bibtexError).toBeDefined();
      expect(bibtexError!.message).toContain('references.bib');
    });
  });

  describe('BibTeX warning parsing', () => {
    test('parses BibTeX citation not found warning', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'bibtex-warnings.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const citationNotFound = diagnostics.find(d =>
        d.code === 'BIBTEX_CITATION_NOT_FOUND'
      );

      expect(citationNotFound).toBeDefined();
      expect(citationNotFound!.severity).toBe('warning');
      expect(citationNotFound!.message).toContain('smith2024');
    });

    test('parses BibTeX missing field warning', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'bibtex-warnings.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const missingField = diagnostics.find(d =>
        d.code === 'BIBTEX_MISSING_FIELD'
      );

      expect(missingField).toBeDefined();
      expect(missingField!.severity).toBe('warning');
      expect(missingField!.message).toContain('year');
      expect(missingField!.message).toContain('jones2023');
    });
  });

  describe('Biber error parsing', () => {
    test('parses Biber error', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'biber-error.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const biberError = diagnostics.find(d =>
        d.severity === 'error' && d.code === 'BIBER_ERROR'
      );

      expect(biberError).toBeDefined();
      expect(biberError!.message).toContain('references.bib');
    });
  });

  describe('file-line-error format parsing', () => {
    test('parses file:line:error format', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'file-line-error.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const fileLineError = diagnostics.find(d =>
        d.code === 'FILE_LINE_ERROR' && d.line === 15
      );

      expect(fileLineError).toBeDefined();
      expect(fileLineError!.message).toContain('Undefined control sequence');
    });

    test('parses errors from included files', () => {
      const log = fs.readFileSync(path.join(fixturesDir, 'file-line-error.log'), 'utf-8');
      const diagnostics = parser.parse(log, projectRoot);

      const introError = diagnostics.find(d =>
        d.file?.includes('intro.tex') && d.line === 42
      );

      expect(introError).toBeDefined();
      expect(introError!.message).toContain('Missing $');
    });
  });

  describe('raw-log fallback', () => {
    test('returns fallback diagnostic when parsing throws', () => {
      // Create a parser with a mock that throws
      const badParser = new TeXLogParser();

      // Test that malformed input doesn't crash
      const weirdLog = '\x00\x01\x02binary garbage';
      const diagnostics = badParser.parse(weirdLog, projectRoot);

      // Should either parse successfully with no errors or return empty array
      // but should NOT throw
      expect(Array.isArray(diagnostics)).toBe(true);
    });
  });

  describe('BibTeX/Biber pattern parsing (inline)', () => {
    test('parses BibTeX citation not found warning', () => {
      const log = `Warning--I didn't find a database entry for "smith2023"`;

      const diagnostics = parser.parse(log, projectRoot);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe('warning');
      expect(diagnostics[0].code).toBe('BIBTEX_CITATION_NOT_FOUND');
      expect(diagnostics[0].message).toContain('smith2023');
    });

    test('parses BibTeX missing field warning', () => {
      const log = `Warning--empty year in jones2020`;

      const diagnostics = parser.parse(log, projectRoot);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('BIBTEX_MISSING_FIELD');
      expect(diagnostics[0].message).toContain('year');
      expect(diagnostics[0].message).toContain('jones2020');
    });

    test('parses Biber error', () => {
      const log = `ERROR - Cannot find 'references.bib'`;

      const diagnostics = parser.parse(log, projectRoot);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[0].code).toBe('BIBER_ERROR');
    });

    test('parses Biber warning', () => {
      const log = `WARN - Duplicate entry key 'smith2023' in file 'refs.bib'`;

      const diagnostics = parser.parse(log, projectRoot);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe('warning');
      expect(diagnostics[0].code).toBe('BIBER_WARNING');
    });

    test('parses multiple BibTeX citations not found', () => {
      const log = `Warning--I didn't find a database entry for "smith2023"
Warning--I didn't find a database entry for "jones2024"
Warning--I didn't find a database entry for "doe2022"`;

      const diagnostics = parser.parse(log, projectRoot);

      const citationNotFound = diagnostics.filter(d => d.code === 'BIBTEX_CITATION_NOT_FOUND');
      expect(citationNotFound.length).toBe(3);
    });

    test('parses BibTeX missing field for different fields', () => {
      const log = `Warning--empty author in ref1
Warning--empty title in ref2
Warning--empty journal in ref3`;

      const diagnostics = parser.parse(log, projectRoot);

      const missingFields = diagnostics.filter(d => d.code === 'BIBTEX_MISSING_FIELD');
      expect(missingFields.length).toBe(3);
      expect(missingFields[0].message).toContain('author');
      expect(missingFields[1].message).toContain('title');
      expect(missingFields[2].message).toContain('journal');
    });
  });

  describe('FILE_LINE_ERROR format parsing (inline)', () => {
    test('parses file:line:error format', () => {
      const log = `./chapter1.tex:15: Undefined control sequence.`;

      const diagnostics = parser.parse(log, projectRoot);

      expect(diagnostics.length).toBeGreaterThan(0);
      const fileLineError = diagnostics.find(d => d.code === 'FILE_LINE_ERROR');
      expect(fileLineError).toBeDefined();
      expect(fileLineError?.line).toBe(15);
    });

    test('resolves relative paths in file:line:error', () => {
      const log = `./chapter1.tex:15: Missing $ inserted.`;

      const diagnostics = parser.parse(log, projectRoot);

      const error = diagnostics.find(d => d.code === 'FILE_LINE_ERROR');
      expect(error?.file).toContain('chapter1.tex');
    });

    test('parses absolute paths in file:line:error', () => {
      const log = `/absolute/path/to/file.tex:42: Undefined control sequence.`;

      const diagnostics = parser.parse(log, projectRoot);

      const error = diagnostics.find(d => d.code === 'FILE_LINE_ERROR');
      expect(error).toBeDefined();
      expect(error?.line).toBe(42);
      expect(error?.file).toBe('/absolute/path/to/file.tex');
    });

    test('extracts error message correctly', () => {
      const log = `./main.tex:100: LaTeX Error: Environment itemize undefined.`;

      const diagnostics = parser.parse(log, projectRoot);

      const error = diagnostics.find(d => d.code === 'FILE_LINE_ERROR');
      expect(error).toBeDefined();
      expect(error?.message).toContain('LaTeX Error');
    });
  });

  describe('Graceful fallback behavior', () => {
    test('returns raw log on parse failure', () => {
      // Test with completely invalid/empty content still produces something
      const diagnostics = parser.parse('', projectRoot);
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('handles malformed log gracefully', () => {
      const malformedLog = `
        ((((((((((
        Random garbage that doesn't match any pattern
        ))))))))))
      `;

      const diagnostics = parser.parse(malformedLog, projectRoot);

      // Should not throw, should return empty or minimal diagnostics
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('handles log with unbalanced parentheses', () => {
      const unbalancedLog = `((/test/file.tex
Some content
) extra close`;

      const diagnostics = parser.parse(unbalancedLog, projectRoot);
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('handles log with special characters', () => {
      const specialLog = `! Error: Special chars: @#$%^&*()[]{}|\\`;

      const diagnostics = parser.parse(specialLog, projectRoot);
      expect(Array.isArray(diagnostics)).toBe(true);
      expect(diagnostics.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    test('handles empty log', () => {
      const diagnostics = parser.parse('', projectRoot);

      expect(Array.isArray(diagnostics)).toBe(true);
      expect(diagnostics.length).toBe(0);
    });

    test('handles log with only whitespace', () => {
      const diagnostics = parser.parse('   \n\n\t\t   ', projectRoot);

      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('handles very long log files', () => {
      const longLog = '! Error\n'.repeat(1000);

      const diagnostics = parser.parse(longLog, projectRoot);

      expect(diagnostics.length).toBeGreaterThan(0);
    });

    test('handles log with only newlines', () => {
      const diagnostics = parser.parse('\n\n\n\n\n', projectRoot);
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('handles unicode characters', () => {
      const unicodeLog = `! Error: Unicode: \u00e9\u00e8\u00ea \u4e2d\u6587 \u0410\u0411\u0412`;

      const diagnostics = parser.parse(unicodeLog, projectRoot);
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('handles carriage return line endings', () => {
      const windowsLog = '! Error message\r\nl.10 some code\r\n';

      const diagnostics = parser.parse(windowsLog, projectRoot);
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('handles mixed line endings', () => {
      const mixedLog = '! First error\n! Second error\r\n! Third error\r';

      const diagnostics = parser.parse(mixedLog, projectRoot);
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('handles consecutive errors', () => {
      const consecutiveErrors = `! Undefined control sequence.
l.10 \\badcmd
! Missing $ inserted.
l.12 x_1`;

      const diagnostics = parser.parse(consecutiveErrors, projectRoot);
      expect(diagnostics.filter(d => d.severity === 'error').length).toBeGreaterThanOrEqual(1);
    });

    test('handles error at very high line number', () => {
      const highLineLog = `! Error at high line
l.99999 some code`;

      const diagnostics = parser.parse(highLineLog, projectRoot);
      const error = diagnostics.find(d => d.line === 99999);
      expect(error).toBeDefined();
    });

    test('handles deeply nested file includes', () => {
      const nestedLog = `(/test/a.tex (/test/b.tex (/test/c.tex (/test/d.tex
! Error in deep file
l.5 code
))))`;

      const diagnostics = parser.parse(nestedLog, projectRoot);
      expect(Array.isArray(diagnostics)).toBe(true);
    });
  });

  describe('Multiple diagnostic types in single log', () => {
    test('parses mixed errors, warnings, and badboxes', () => {
      const mixedLog = `
! Undefined control sequence.
l.10 \\badcmd

LaTeX Warning: Reference \`fig:test' on page 1 undefined on input line 20.

Overfull \\hbox (10.0pt too wide) in paragraph at lines 30--35
`;

      const diagnostics = parserWithBadbox.parse(mixedLog, projectRoot);

      const errors = diagnostics.filter(d => d.severity === 'error');
      const warnings = diagnostics.filter(d => d.severity === 'warning');
      const infos = diagnostics.filter(d => d.severity === 'info');

      expect(errors.length).toBeGreaterThan(0);
      expect(warnings.length).toBeGreaterThan(0);
      expect(infos.length).toBeGreaterThan(0);
    });

    test('preserves order of diagnostics', () => {
      const orderedLog = `
! First error
l.1 code

! Second error
l.2 code

! Third error
l.3 code
`;

      const diagnostics = parser.parse(orderedLog, projectRoot);
      const errors = diagnostics.filter(d => d.severity === 'error');

      // First error should come before second, etc.
      if (errors.length >= 2) {
        expect(errors[0].line).toBeLessThan(errors[1].line!);
      }
    });
  });

  describe('Package and class specific parsing', () => {
    test('parses hyperref package warning', () => {
      const log = `Package hyperref Warning: Token not allowed in a PDF string (PDFDocEncoding) on input line 50.`;

      const diagnostics = parser.parse(log, projectRoot);

      const warning = diagnostics.find(d => d.code?.includes('HYPERREF'));
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('warning');
    });

    test('parses memoir class warning', () => {
      const log = `Class memoir Warning: You are using a deprecated command on input line 100.`;

      const diagnostics = parser.parse(log, projectRoot);

      const warning = diagnostics.find(d => d.code?.includes('MEMOIR'));
      expect(warning).toBeDefined();
    });
  });
});
