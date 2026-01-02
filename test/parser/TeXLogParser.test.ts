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
});
