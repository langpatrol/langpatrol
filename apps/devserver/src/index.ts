import express from 'express';
import cors from 'cors';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzePrompt } from 'langpatrol';

// Path resolution: try multiple approaches to find the repo root
// When running via pnpm --filter, cwd might be the package dir, so we need to go up
function findRepoRoot(): string {
  let cwd = process.cwd();
  // If we're in apps/devserver, go up to repo root
  if (cwd.includes('apps/devserver')) {
    return join(cwd.replace(/apps\/devserver.*$/, ''), 'datasets/synthetic');
  }
  // Try going up from current directory to find datasets/synthetic
  let current = cwd;
  for (let i = 0; i < 5; i++) {
    const testPath = join(current, 'datasets/synthetic');
    if (existsSync(testPath)) {
      return testPath;
    }
    current = join(current, '..');
  }
  // Last resort: assume repo root is 2 levels up from apps/devserver
  return join(cwd, '../../datasets/synthetic');
}

const DATASETS_DIR = findRepoRoot();

const app = express();

// CORS locked to localhost only - local development tool, not for production
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true
  })
);
// Increase body size limit to 10MB for large prompts
// Safe for local dev server: localhost-only, no external exposure, testing large prompts
app.use(express.json({ limit: '10mb' }));

app.post('/analyze', async (req, res) => {
  try {
    const report = await analyzePrompt(req.body);
    res.json(report);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// List available test files
app.get('/files', async (req, res) => {
  try {
    console.log('Looking for files in:', DATASETS_DIR);
    const files = await readdir(DATASETS_DIR);
    const textFiles = files.filter((f) => f.endsWith('.txt') || f.endsWith('.csv'));
    console.log('Found test files:', textFiles);
    res.json({ files: textFiles });
  } catch (e) {
    console.error('Error reading datasets directory:', e);
    res.status(500).json({ error: String(e), path: DATASETS_DIR });
  }
});

// Load a test file
app.get('/files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    // Security: only allow .txt and .csv files, prevent directory traversal
    if (!filename.match(/^[a-zA-Z0-9_.-]+\.(txt|csv)$/)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = join(DATASETS_DIR, filename);
    const content = await readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.listen(5174, () => console.log('devserver on http://localhost:5174'));

