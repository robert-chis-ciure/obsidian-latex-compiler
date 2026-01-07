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
 * Tectonic release information
 * Updated: January 2025
 */
export const TECTONIC_VERSION = '0.15.0';
export const TECTONIC_RELEASE_URL = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}`;

/**
 * Tectonic binary download URLs by platform and architecture
 */
export const TECTONIC_DOWNLOADS: Record<string, Record<string, { url: string; binary: string }>> = {
  darwin: {
    x64: {
      url: `${TECTONIC_RELEASE_URL}/tectonic-${TECTONIC_VERSION}-x86_64-apple-darwin.tar.gz`,
      binary: 'tectonic',
    },
    arm64: {
      url: `${TECTONIC_RELEASE_URL}/tectonic-${TECTONIC_VERSION}-aarch64-apple-darwin.tar.gz`,
      binary: 'tectonic',
    },
  },
  linux: {
    x64: {
      url: `${TECTONIC_RELEASE_URL}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz`,
      binary: 'tectonic',
    },
    arm64: {
      url: `${TECTONIC_RELEASE_URL}/tectonic-${TECTONIC_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
      binary: 'tectonic',
    },
  },
  win32: {
    x64: {
      url: `${TECTONIC_RELEASE_URL}/tectonic-${TECTONIC_VERSION}-x86_64-pc-windows-msvc.zip`,
      binary: 'tectonic.exe',
    },
  },
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
  SYNCTEX_FORWARD: 'latex-compiler:synctex-forward',
  SYNCTEX_REVERSE: 'latex-compiler:synctex-reverse',
};

export const VIEW_TYPE_PROJECTS = 'latex-projects-view';
