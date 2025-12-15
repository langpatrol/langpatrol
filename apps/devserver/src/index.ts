import express from 'express';
import cors from 'cors';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzePrompt, type AnalyzeInput, isSemanticSimilarityAvailable, isNLIEntailmentAvailable, redactPII } from 'langpatrol';

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

// Redact PII from a prompt
app.post('/redact-pii', async (req, res) => {
  try {
    const { prompt, options } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const result = await redactPII({ prompt, options });
    res.json(result);
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

// Test semantic and NLI features
app.post('/test-semantic', async (req, res) => {
  try {
    const { filename = '20k_tokens_prompt.txt' } = req.body;
    
    // Security: only allow .txt and .csv files, prevent directory traversal
    if (!filename.match(/^[a-zA-Z0-9_.-]+\.(txt|csv)$/)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = join(DATASETS_DIR, filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: ${filename}` });
    }

    const prompt = await readFile(filePath, 'utf-8');
    console.log(`[test-semantic] Testing with ${filename} (${prompt.length.toLocaleString()} chars)`);

    const results: Array<{
      test: string;
      time: number;
      issues: number;
      missingRef: number;
      methods: string[];
      semanticMatches: Array<{ text: string; method: string; confidence: number }>;
    }> = [];

    // Test 1: Baseline (no semantic features)
    console.log('[test-semantic] Running baseline test...');
    const inputBaseline: AnalyzeInput = {
      prompt,
      model: 'gpt-4o',
      options: {
        useSemanticSimilarity: false,
        useNLIEntailment: false
      }
    };

    const startBaseline = performance.now();
    const reportBaseline = await analyzePrompt(inputBaseline);
    const timeBaseline = performance.now() - startBaseline;

    const missingRefBaseline = reportBaseline.issues.filter(i => i.code === 'MISSING_REFERENCE');
    const methodsBaseline = new Set<string>();
    missingRefBaseline.forEach(issue => {
      if (issue.evidence && !Array.isArray(issue.evidence) && issue.evidence.occurrences) {
        issue.evidence.occurrences.forEach((occ) => {
          if ('fulfillmentMethod' in occ && occ.fulfillmentMethod) {
            methodsBaseline.add(occ.fulfillmentMethod);
          }
        });
      }
    });

    results.push({
      test: 'Baseline (no semantic features)',
      time: timeBaseline,
      issues: reportBaseline.issues.length,
      missingRef: missingRefBaseline.length,
      methods: Array.from(methodsBaseline),
      semanticMatches: []
    });

    // Test 2: Semantic Similarity only
    console.log('[test-semantic] Running semantic similarity test...');
    console.log('[test-semantic] Checking semantic availability...');
    const semanticAvail = isSemanticSimilarityAvailable();
    const nliAvail = isNLIEntailmentAvailable();
    console.log('[test-semantic] Semantic similarity available:', semanticAvail);
    console.log('[test-semantic] NLI available:', nliAvail);
    
    const inputSemantic: AnalyzeInput = {
      prompt,
      model: 'gpt-4o',
      options: {
        useSemanticSimilarity: true,
        useNLIEntailment: false,
        similarityThreshold: 0.6
      }
    };
    console.log('[test-semantic] Input options:', JSON.stringify(inputSemantic.options, null, 2));
    console.log('[test-semantic] Will use async version:', semanticAvail || nliAvail);

    const startSemantic = performance.now();
    const reportSemantic = await analyzePrompt(inputSemantic);
    const timeSemantic = performance.now() - startSemantic;

    console.log('[test-semantic] Semantic test completed. Issues:', reportSemantic.issues.length);
    const missingRefSemantic = reportSemantic.issues.filter(i => i.code === 'MISSING_REFERENCE');
    console.log('[test-semantic] MISSING_REFERENCE issues:', missingRefSemantic.length);
    const methodsSemantic = new Set<string>();
    const semanticMatches: Array<{ text: string; method: string; confidence: number; status: string; details?: any }> = [];
    
    missingRefSemantic.forEach(issue => {
      if (issue.evidence && !Array.isArray(issue.evidence) && issue.evidence.occurrences) {
        issue.evidence.occurrences.forEach((occ) => {
          console.log('[test-semantic] Occurrence:', {
            text: occ.text?.substring(0, 50),
            fulfillmentMethod: 'fulfillmentMethod' in occ ? occ.fulfillmentMethod : 'none',
            fulfillmentStatus: 'fulfillmentStatus' in occ ? occ.fulfillmentStatus : 'none',
            fulfillmentConfidence: 'fulfillmentConfidence' in occ ? occ.fulfillmentConfidence : 'none',
            hasDetails: 'fulfillmentDetails' in occ && occ.fulfillmentDetails ? 'yes' : 'no',
            details: 'fulfillmentDetails' in occ ? occ.fulfillmentDetails : undefined
          });
          
          if ('fulfillmentMethod' in occ && occ.fulfillmentMethod) {
            methodsSemantic.add(occ.fulfillmentMethod);
            // Check for semantic methods or combined
            if ((occ.fulfillmentMethod === 'semantic-similarity' || occ.fulfillmentMethod === 'combined') && 'fulfillmentConfidence' in occ) {
              semanticMatches.push({
                text: occ.text,
                method: occ.fulfillmentMethod,
                confidence: occ.fulfillmentConfidence || 0,
                status: occ.fulfillmentStatus || 'unknown',
                details: 'fulfillmentDetails' in occ ? occ.fulfillmentDetails : undefined
              });
            }
            // Also check fulfillmentDetails for semantic scores even if method is pattern
            if ('fulfillmentDetails' in occ && occ.fulfillmentDetails) {
              const details = occ.fulfillmentDetails as any;
              if (details.similarityScore !== undefined || details.entailmentScore !== undefined || details.combinedScore !== undefined) {
                semanticMatches.push({
                  text: occ.text,
                  method: occ.fulfillmentMethod || 'pattern',
                  confidence: occ.fulfillmentConfidence || 0,
                  status: occ.fulfillmentStatus || 'unknown',
                  details
                });
              }
            }
          }
        });
      }
    });
    
    console.log('[test-semantic] Semantic matches found:', semanticMatches.length);

    results.push({
      test: 'Semantic Similarity (MiniLM-L6-v2)',
      time: timeSemantic,
      issues: reportSemantic.issues.length,
      missingRef: missingRefSemantic.length,
      methods: Array.from(methodsSemantic),
      semanticMatches
    });

    // Test 3: NLI Entailment only
    console.log('[test-semantic] Running NLI entailment test...');
    const inputNLI: AnalyzeInput = {
      prompt,
      model: 'gpt-4o',
      options: {
        useSemanticSimilarity: false,
        useNLIEntailment: true,
        similarityThreshold: 0.6
      }
    };

    const startNLI = performance.now();
    const reportNLI = await analyzePrompt(inputNLI);
    const timeNLI = performance.now() - startNLI;

    const missingRefNLI = reportNLI.issues.filter(i => i.code === 'MISSING_REFERENCE');
    const methodsNLI = new Set<string>();
    const nliMatches: Array<{ text: string; method: string; confidence: number; status: string; details?: any }> = [];
    
    missingRefNLI.forEach(issue => {
      if (issue.evidence && !Array.isArray(issue.evidence) && issue.evidence.occurrences) {
        issue.evidence.occurrences.forEach((occ) => {
          if ('fulfillmentMethod' in occ && occ.fulfillmentMethod) {
            methodsNLI.add(occ.fulfillmentMethod);
            // Check for NLI methods or combined
            if ((occ.fulfillmentMethod === 'nli-entailment' || occ.fulfillmentMethod === 'combined') && 'fulfillmentConfidence' in occ) {
              nliMatches.push({
                text: occ.text,
                method: occ.fulfillmentMethod,
                confidence: occ.fulfillmentConfidence || 0,
                status: occ.fulfillmentStatus || 'unknown',
                details: 'fulfillmentDetails' in occ ? occ.fulfillmentDetails : undefined
              });
            }
            // Also check fulfillmentDetails for NLI scores even if method is pattern
            if ('fulfillmentDetails' in occ && occ.fulfillmentDetails) {
              const details = occ.fulfillmentDetails as any;
              if (details.entailmentScore !== undefined || details.combinedScore !== undefined) {
                nliMatches.push({
                  text: occ.text,
                  method: occ.fulfillmentMethod || 'pattern',
                  confidence: occ.fulfillmentConfidence || 0,
                  status: occ.fulfillmentStatus || 'unknown',
                  details
                });
              }
            }
          }
        });
      }
    });

    results.push({
      test: 'NLI Entailment (distilbert-base-uncased-mnli)',
      time: timeNLI,
      issues: reportNLI.issues.length,
      missingRef: missingRefNLI.length,
      methods: Array.from(methodsNLI),
      semanticMatches: nliMatches
    });

    // Test 4: Both features
    console.log('[test-semantic] Running both features test...');
    const inputBoth: AnalyzeInput = {
      prompt,
      model: 'gpt-4o',
      options: {
        useSemanticSimilarity: true,
        useNLIEntailment: true,
        similarityThreshold: 0.6
      }
    };

    const startBoth = performance.now();
    const reportBoth = await analyzePrompt(inputBoth);
    const timeBoth = performance.now() - startBoth;

    const missingRefBoth = reportBoth.issues.filter(i => i.code === 'MISSING_REFERENCE');
    const methodsBoth = new Set<string>();
    const bothMatches: Array<{ text: string; method: string; confidence: number; status: string; details?: any }> = [];
    
    missingRefBoth.forEach(issue => {
      if (issue.evidence && !Array.isArray(issue.evidence) && issue.evidence.occurrences) {
        issue.evidence.occurrences.forEach((occ) => {
          if ('fulfillmentMethod' in occ && occ.fulfillmentMethod) {
            methodsBoth.add(occ.fulfillmentMethod);
            // Check for semantic methods, NLI, or combined
            if ((occ.fulfillmentMethod === 'semantic-similarity' || occ.fulfillmentMethod === 'nli-entailment' || occ.fulfillmentMethod === 'combined') && 'fulfillmentConfidence' in occ) {
              bothMatches.push({
                text: occ.text,
                method: occ.fulfillmentMethod,
                confidence: occ.fulfillmentConfidence || 0,
                status: occ.fulfillmentStatus || 'unknown',
                details: 'fulfillmentDetails' in occ ? occ.fulfillmentDetails : undefined
              });
            }
            // Also check fulfillmentDetails for any semantic scores
            if ('fulfillmentDetails' in occ && occ.fulfillmentDetails) {
              const details = occ.fulfillmentDetails as any;
              if (details.similarityScore !== undefined || details.entailmentScore !== undefined || details.combinedScore !== undefined) {
                bothMatches.push({
                  text: occ.text,
                  method: occ.fulfillmentMethod || 'pattern',
                  confidence: occ.fulfillmentConfidence || 0,
                  status: occ.fulfillmentStatus || 'unknown',
                  details
                });
              }
            }
          }
        });
      }
    });

    results.push({
      test: 'Both Features (Semantic + NLI)',
      time: timeBoth,
      issues: reportBoth.issues.length,
      missingRef: missingRefBoth.length,
      methods: Array.from(methodsBoth),
      semanticMatches: bothMatches
    });

    // Summary
    const summary = {
      baseline: {
        issues: results[0].issues,
        missingRef: results[0].missingRef,
        time: results[0].time
      },
      semantic: {
        issues: results[1].issues,
        missingRef: results[1].missingRef,
        time: results[1].time,
        matches: results[1].semanticMatches.length
      },
      nli: {
        issues: results[2].issues,
        missingRef: results[2].missingRef,
        time: results[2].time,
        matches: results[2].semanticMatches.length
      },
      both: {
        issues: results[3].issues,
        missingRef: results[3].missingRef,
        time: results[3].time,
        matches: results[3].semanticMatches.length
      }
    };

    console.log('[test-semantic] Tests completed');
    res.json({
      filename,
      fileSize: prompt.length,
      results,
      summary
    });
  } catch (e) {
    console.error('[test-semantic] Error:', e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(5174, () => console.log('devserver on http://localhost:5174'));

