/**
 * Regex patterns for parsing TeX logs
 */

/** Main error line starting with "!" */
export const ERROR = /^!\s*(.+)$/;

/** Line number indicator "l.XXX" */
export const LINE_NUMBER = /^l\.(\d+)\s*(.*)$/;

/** LaTeX or Package warning */
export const WARNING = /^(?:LaTeX|Package\s+(\w+))\s+Warning:\s*(.+)$/;

/** Class warning */
export const CLASS_WARNING = /^Class\s+(\w+)\s+Warning:\s*(.+)$/;

/** Overfull/Underfull box warnings */
export const BADBOX = /^(Over|Under)full\s+\\([hv])box\s+\((.+?)\)\s+(?:in paragraph\s+)?at\s+lines?\s+(\d+)(?:--(\d+))?/;

/** File open indicator - matches paths inside parentheses */
export const FILE_OPEN = /\(([^\s()]+\.(?:tex|sty|cls|bib|aux|bbl|def|cfg|clo|fd|ldf))/gi;

/** Missing file error */
export const MISSING_FILE = /^!\s*LaTeX\s+Error:\s*File\s+`(.+)'\s+not\s+found/;

/** Missing package - extracted from emergency stop */
export const MISSING_PACKAGE = /^\s*!\s*(?:LaTeX\s+Error:\s*)?File\s+`([^']+\.sty)'\s+not\s+found/;

/** Undefined control sequence */
export const UNDEFINED_CONTROL = /^!\s*Undefined\s+control\s+sequence/;

/** Undefined reference */
export const UNDEFINED_REF = /^LaTeX\s+Warning:\s*Reference\s+`([^']+)'\s+on\s+page\s+\d+\s+undefined/;

/** Undefined citation */
export const UNDEFINED_CITATION = /^LaTeX\s+Warning:\s*Citation\s+`([^']+)'\s+on\s+page\s+\d+\s+undefined/;

/** Package error */
export const PACKAGE_ERROR = /^!\s*Package\s+(\w+)\s+Error:\s*(.+)$/;

/** Class error */
export const CLASS_ERROR = /^!\s*Class\s+(\w+)\s+Error:\s*(.+)$/;

/** Font warning */
export const FONT_WARNING = /^LaTeX\s+Font\s+Warning:\s*(.+)$/;

/** Emergency stop indicator */
export const EMERGENCY_STOP = /^!\s*(?:Emergency\s+stop|==>)\s*Fatal\s+error/;

/** Shell escape required (minted, etc.) */
export const SHELL_ESCAPE_REQUIRED = /must\s+invoke\s+LaTeX\s+with\s+the\s+-shell-escape\s+flag/i;

/** Input line number in warnings */
export const INPUT_LINE = /on\s+input\s+line\s+(\d+)/;

/** Output written indicator */
export const OUTPUT_WRITTEN = /^Output\s+written\s+on\s+(.+)\s+\(\d+\s+pages?,/;

/** Run number indicator from latexmk */
export const LATEXMK_RUN = /^Latexmk:\s+applying\s+rule\s+'([^']+)'/;

/** Latexmk success indicator */
export const LATEXMK_SUCCESS = /^Latexmk:\s+All\s+targets\s+\(.+\)\s+are\s+up-to-date/;

/** BibTeX/Biber error - file not found */
export const BIBTEX_ERROR = /^I\s+couldn't\s+open\s+(?:file\s+name|database\s+file)\s+(.+)/;

/** Citation not found in .bib */
export const BIBTEX_CITATION_NOT_FOUND = /^Warning--I\s+didn't\s+find\s+a\s+database\s+entry\s+for\s+"([^"]+)"/;

/** BibTeX generic warning */
export const BIBTEX_WARNING = /^Warning--(.+)$/;

/** Biber error */
export const BIBER_ERROR = /^ERROR\s+-\s+(.+)$/;

/** Biber warning */
export const BIBER_WARNING = /^WARN\s+-\s+(.+)$/;

/** Biber info */
export const BIBER_INFO = /^INFO\s+-\s+(.+)$/;

/** BibTeX database error - missing field */
export const BIBTEX_MISSING_FIELD = /^Warning--empty\s+(\w+)\s+in\s+(.+)$/;

/** BibTeX repeated entry */
export const BIBTEX_REPEATED_ENTRY = /^Warning--I'm\s+ignoring\s+.+'s\s+extra\s+"([^"]+)"\s+field/;

/** File line error format (with -file-line-error flag) */
export const FILE_LINE_ERROR = /^(.+):(\d+):\s*(.+)$/;
