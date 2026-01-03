/**
 * Common TeX installation paths by platform
 */
export const TEX_PATHS = {
  darwin: [
    '/Library/TeX/texbin',
    '/usr/local/texlive/2024/bin/universal-darwin',
    '/usr/local/texlive/2023/bin/universal-darwin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ],
  linux: [
    '/usr/bin',
    '/usr/local/bin',
    '/usr/local/texlive/2024/bin/x86_64-linux',
    '/usr/local/texlive/2023/bin/x86_64-linux',
  ],
  win32: [
    'C:\\texlive\\2024\\bin\\win64',
    'C:\\texlive\\2023\\bin\\win64',
    'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64',
    'C:\\Program Files (x86)\\MiKTeX\\miktex\\bin',
  ],
};

/**
 * File extensions to watch for changes in watch mode
 */
export const WATCH_EXTENSIONS = ['.tex', '.bib', '.cls', '.sty', '.bst'];

/**
 * Files/directories to ignore in file watching
 */
export const WATCH_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.latex-out/**',
  '**/build/**',
  '**/dist/**',
];

/**
 * View type identifiers
 */
export const VIEW_TYPE_DIAGNOSTICS = 'latex-diagnostics';
export const VIEW_TYPE_PDF_PREVIEW = 'latex-pdf-preview';

/**
 * Command identifiers
 */
export const COMMANDS = {
  COMPILE: 'latex-compiler:compile',
  WATCH: 'latex-compiler:watch',
  STOP_WATCH: 'latex-compiler:stop-watch',
  CLEAN: 'latex-compiler:clean',
  SHOW_DIAGNOSTICS: 'latex-compiler:show-diagnostics',
  SHOW_LOG: 'latex-compiler:show-log',
  CHECK_INSTALLATION: 'latex-compiler:check-installation',
};

export const VIEW_TYPE_PROJECTS = 'latex-projects-view';
