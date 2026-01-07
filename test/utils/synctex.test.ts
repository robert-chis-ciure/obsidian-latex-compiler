import { SyncTeXParser, findSyncTeXFile } from '../../src/utils/synctex';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

describe('SyncTeXParser', () => {
  let parser: SyncTeXParser;
  let tempDir: string;

  beforeEach(() => {
    parser = new SyncTeXParser();
  });

  describe('parse', () => {
    it('should parse basic SyncTeX content', async () => {
      // Create a minimal SyncTeX file content
      const synctexContent = `SyncTeX Version:1
Input:1:/project/main.tex
Input:2:/project/chapter.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
{1
h1,10,0:1000,5000
h1,20,0:1000,6000
h2,5,0:1000,7000
}
{2
h1,30,0:1000,5000
}
`;

      // Write to temp file
      tempDir = await fs.mkdtemp('/tmp/synctex-test-');
      const synctexPath = path.join(tempDir, 'test.synctex');
      await fs.writeFile(synctexPath, synctexContent);

      await parser.load(synctexPath, '/project');

      expect(parser.hasData()).toBe(true);
      expect(parser.getEntryCount()).toBeGreaterThan(0);
    });

    it('should handle gzipped SyncTeX files', async () => {
      const synctexContent = `SyncTeX Version:1
Input:1:/project/main.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
{1
h1,10,0:1000,5000
}
`;

      tempDir = await fs.mkdtemp('/tmp/synctex-test-');
      const synctexPath = path.join(tempDir, 'test.synctex.gz');
      const compressed = await gzip(Buffer.from(synctexContent));
      await fs.writeFile(synctexPath, compressed);

      await parser.load(synctexPath, '/project');

      expect(parser.hasData()).toBe(true);
    });

    it('should return empty data for empty file', async () => {
      tempDir = await fs.mkdtemp('/tmp/synctex-test-');
      const synctexPath = path.join(tempDir, 'empty.synctex');
      await fs.writeFile(synctexPath, '');

      await parser.load(synctexPath, '/project');

      expect(parser.hasData()).toBe(false);
      expect(parser.getEntryCount()).toBe(0);
    });
  });

  describe('forwardSearch', () => {
    beforeEach(async () => {
      const synctexContent = `SyncTeX Version:1
Input:1:/project/main.tex
Input:2:/project/chapter.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
{1
h1,10,0:1000,5000
h1,11,0:1100,5100
h1,20,0:1000,6000
h2,5,0:2000,3000
}
{2
h1,30,0:1000,5000
h2,15,0:3000,4000
}
`;

      tempDir = await fs.mkdtemp('/tmp/synctex-test-');
      const synctexPath = path.join(tempDir, 'test.synctex');
      await fs.writeFile(synctexPath, synctexContent);

      await parser.load(synctexPath, '/project');
    });

    it('should find PDF location for exact line match', () => {
      const result = parser.forwardSearch('/project/main.tex', 10);

      expect(result).not.toBeNull();
      expect(result?.page).toBe(1);
    });

    it('should find PDF location for different file', () => {
      const result = parser.forwardSearch('/project/chapter.tex', 5);

      expect(result).not.toBeNull();
      expect(result?.page).toBe(1);
    });

    it('should find PDF location on second page', () => {
      const result = parser.forwardSearch('/project/main.tex', 30);

      expect(result).not.toBeNull();
      expect(result?.page).toBe(2);
    });

    it('should find closest line within range', () => {
      // Line 12 doesn't exist, should find line 11 (closest)
      const result = parser.forwardSearch('/project/main.tex', 12);

      expect(result).not.toBeNull();
      expect(result?.page).toBe(1);
    });

    it('should return null for non-existent file', () => {
      const result = parser.forwardSearch('/project/nonexistent.tex', 10);

      expect(result).toBeNull();
    });

    it('should return null for line too far from any entry', () => {
      const result = parser.forwardSearch('/project/main.tex', 1000);

      expect(result).toBeNull();
    });
  });

  describe('reverseSearch', () => {
    beforeEach(async () => {
      // Note: With Magnification:1000 and Unit:1, coordinates are divided by 1000
      // So raw coordinates 100000,200000 become PDF coordinates 100,200
      const synctexContent = `SyncTeX Version:1
Input:1:/project/main.tex
Input:2:/project/chapter.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
{1
h1,10,0:100000,200000
h1,20,0:100000,400000
h2,5,0:300000,200000
}
{2
h1,30,0:100000,200000
}
`;

      tempDir = await fs.mkdtemp('/tmp/synctex-test-');
      const synctexPath = path.join(tempDir, 'test.synctex');
      await fs.writeFile(synctexPath, synctexContent);

      await parser.load(synctexPath, '/project');
    });

    it('should find source location for page 1 coordinates', () => {
      const result = parser.reverseSearch(1, 100, 200);

      expect(result).not.toBeNull();
      expect(result?.file).toContain('main.tex');
      expect(result?.line).toBe(10);
    });

    it('should find source location for page 2', () => {
      const result = parser.reverseSearch(2, 100, 200);

      expect(result).not.toBeNull();
      expect(result?.file).toContain('main.tex');
      expect(result?.line).toBe(30);
    });

    it('should find closest entry by distance', () => {
      // Coordinates closer to the chapter.tex entry at (300, 200)
      const result = parser.reverseSearch(1, 290, 210);

      expect(result).not.toBeNull();
      expect(result?.file).toContain('chapter.tex');
      expect(result?.line).toBe(5);
    });

    it('should return null for page with no entries', () => {
      const result = parser.reverseSearch(3, 100, 200);

      expect(result).toBeNull();
    });

    it('should return null for coordinates too far from any entry', () => {
      const result = parser.reverseSearch(1, 1000, 1000);

      expect(result).toBeNull();
    });
  });

  describe('getInputFiles', () => {
    it('should return list of input files', async () => {
      const synctexContent = `SyncTeX Version:1
Input:1:/project/main.tex
Input:2:/project/chapter.tex
Input:3:/project/appendix.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
{1
h1,10,0:1000,5000
}
`;

      tempDir = await fs.mkdtemp('/tmp/synctex-test-');
      const synctexPath = path.join(tempDir, 'test.synctex');
      await fs.writeFile(synctexPath, synctexContent);

      await parser.load(synctexPath, '/project');

      const files = parser.getInputFiles();
      expect(files.length).toBe(3);
      expect(files).toContain('/project/main.tex');
      expect(files).toContain('/project/chapter.tex');
      expect(files).toContain('/project/appendix.tex');
    });
  });

  afterEach(async () => {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });
});

describe('findSyncTeXFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp('/tmp/synctex-find-test-');
  });

  it('should find .synctex.gz file', async () => {
    const pdfPath = path.join(tempDir, 'test.pdf');
    const synctexPath = path.join(tempDir, 'test.synctex.gz');

    await fs.writeFile(pdfPath, 'dummy pdf');
    await fs.writeFile(synctexPath, 'dummy synctex');

    const result = await findSyncTeXFile(pdfPath);

    expect(result).toBe(synctexPath);
  });

  it('should find .synctex file', async () => {
    const pdfPath = path.join(tempDir, 'test.pdf');
    const synctexPath = path.join(tempDir, 'test.synctex');

    await fs.writeFile(pdfPath, 'dummy pdf');
    await fs.writeFile(synctexPath, 'dummy synctex');

    const result = await findSyncTeXFile(pdfPath);

    expect(result).toBe(synctexPath);
  });

  it('should prefer .synctex.gz over .synctex', async () => {
    const pdfPath = path.join(tempDir, 'test.pdf');
    const synctexGzPath = path.join(tempDir, 'test.synctex.gz');
    const synctexPath = path.join(tempDir, 'test.synctex');

    await fs.writeFile(pdfPath, 'dummy pdf');
    await fs.writeFile(synctexGzPath, 'dummy synctex gz');
    await fs.writeFile(synctexPath, 'dummy synctex');

    const result = await findSyncTeXFile(pdfPath);

    expect(result).toBe(synctexGzPath);
  });

  it('should return null if no SyncTeX file exists', async () => {
    const pdfPath = path.join(tempDir, 'test.pdf');
    await fs.writeFile(pdfPath, 'dummy pdf');

    const result = await findSyncTeXFile(pdfPath);

    expect(result).toBeNull();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});
