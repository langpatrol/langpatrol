/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePrompt } from '../../packages/langpatrol/src/index';
import type { AnalyzeInput, Report, IssueCode, Msg, JSONSchema7 } from '../../packages/langpatrol/src/index';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BenchmarkConfig {
  datasetPath: string;
  outputPath: string;
  parameterSets: ParameterSet[];
  warmupRuns?: number;
  iterations?: number;
  concurrency?: number;
  timeout?: number;
}

interface ParameterSet {
  name: string;
  description?: string;
  options: {
    useSemanticSimilarity?: boolean;
    useNLIEntailment?: boolean;
    useNLPExtraction?: boolean;
    usePatternMatching?: boolean;
    useSemanticConflictDetection?: boolean;
    useNLIConflictDetection?: boolean;
    similarityThreshold?: number;
    conflictSimilarityThreshold?: number;
    conflictContradictionThreshold?: number;
    useCombinedScoring?: boolean;
    combineWeights?: {
      pattern?: number;
      semantic?: number;
      nli?: number;
    };
    combinedThreshold?: number;
    disabledRules?: IssueCode[];
    [key: string]: any;
  };
}

interface TestCase {
  id: string;
  category?: string;
  prompt?: string;
  messages?: Msg[];
  schema?: JSONSchema7;
  expectedIssueCodes?: IssueCode[];
  notes?: string;
}

interface BenchmarkResult {
  testCaseId: string;
  parameterSet: string;
  latency: number;
  issues: {
    total: number;
    byCode: Record<string, number>;
    details: Array<{
      code: string;
      severity: string;
      confidence: string;
      detail: string;
    }>;
  };
  accuracy?: {
    precision: number;      // True positives / (True positives + False positives)
    recall: number;          // True positives / (True positives + False negatives)
    f1Score: number;         // 2 * (precision * recall) / (precision + recall)
    truePositives: number;   // Correctly detected issues
    falsePositives: number;  // Issues detected but not expected
    falseNegatives: number;  // Expected issues not detected
    expectedIssues: IssueCode[];
    detectedIssues: IssueCode[];
  };
  cost?: {
    estInputTokens?: number;
    charCount?: number;
    method?: string;
  };
  meta?: {
    latencyMs?: number;
    ruleTimings?: Record<string, number>;
    traceId?: string;
    contextWindow?: number;
    modelHint?: string;
  };
  error?: string;
}

interface BenchmarkReport {
  metadata: {
    timestamp: string;
    datasetPath: string;
    totalTestCases: number;
    totalParameterSets: number;
    totalRuns: number;
    duration: number;
  };
  parameterSets: Array<{
    name: string;
    description?: string;
    options: Record<string, any>;
  }>;
  results: BenchmarkResult[];
  summary: {
    byParameterSet: Record<string, {
      totalRuns: number;
      successRate: number;
      avgLatency: number;
      totalIssues: number;
      issuesByCode: Record<string, number>;
      avgRuleTimings: Record<string, number>;
      avgAccuracy?: {
        precision: number;
        recall: number;
        f1Score: number;
        avgTruePositives: number;
        avgFalsePositives: number;
        avgFalseNegatives: number;
      };
    }>;
    byTestCase: Record<string, {
      runs: number;
      avgLatency: number;
      issuesFound: Record<string, number>;
    }>;
  };
}

function parseCsv(csvPath: string): TestCase[] {
  const csv = readFileSync(csvPath, 'utf-8');
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map((line) => {
    // Simple CSV parsing (handles quoted fields)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      let value = values[i] || '';
      // Remove surrounding quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      row[header] = value;
    });
    
    let messages: Msg[] | undefined;
    try {
      messages = row.messages_json ? JSON.parse(row.messages_json) : undefined;
    } catch {
      messages = undefined;
    }
    
    let schema: JSONSchema7 | undefined;
    try {
      schema = row.schema_json ? JSON.parse(row.schema_json) : undefined;
    } catch {
      schema = undefined;
    }
    
    let expectedIssueCodes: IssueCode[] | undefined;
    try {
      expectedIssueCodes = row.expected_issue_codes ? JSON.parse(row.expected_issue_codes) : undefined;
    } catch {
      expectedIssueCodes = undefined;
    }
    
    return {
      id: row.id || `test-${Math.random().toString(36).substr(2, 9)}`,
      category: row.category,
      prompt: row.prompt || undefined,
      messages,
      schema,
      expectedIssueCodes,
      notes: row.notes
    };
  });
}

function loadTextFiles(directory: string): TestCase[] {
  const files = readdirSync(directory);
  const testCases: TestCase[] = [];
  
  for (const file of files) {
    if (file.endsWith('.txt') && !file.includes('annotated') && !file.includes('stats')) {
      const filePath = join(directory, file);
      const content = readFileSync(filePath, 'utf-8');
      testCases.push({
        id: file.replace('.txt', ''),
        prompt: content,
        category: 'synthetic'
      });
    }
  }
  
  return testCases;
}

function loadJsonDataset(directory: string): TestCase[] {
  const testCases: TestCase[] = [];
  const indexPath = join(directory, 'index.json');
  
  if (!existsSync(indexPath)) {
    console.warn(`Warning: index.json not found in ${directory}, trying to load all .json files`);
    // Fallback: load all .json files in directory
    const files = readdirSync(directory);
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'index.json') {
        const filePath = join(directory, file);
        try {
          const content = readFileSync(filePath, 'utf-8');
          const testCase = JSON.parse(content);
          testCases.push({
            id: testCase.id || file.replace('.json', ''),
            category: testCase.category,
            prompt: testCase.prompt,
            messages: testCase.messages,
            schema: testCase.schema,
            expectedIssueCodes: testCase.expectedIssueCodes,
            notes: testCase.notes
          });
        } catch (error) {
          console.warn(`Warning: Could not load ${file}: ${error}`);
        }
      }
    }
    return testCases;
  }
  
  try {
    const indexContent = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(indexContent);
    const testCaseIds = index.testCases || [];
    
    for (const testId of testCaseIds) {
      const testCasePath = join(directory, `${testId}.json`);
      if (existsSync(testCasePath)) {
        try {
          const content = readFileSync(testCasePath, 'utf-8');
          const testCase = JSON.parse(content);
          testCases.push({
            id: testCase.id || testId,
            category: testCase.category,
            prompt: testCase.prompt,
            messages: testCase.messages,
            schema: testCase.schema,
            expectedIssueCodes: testCase.expectedIssueCodes,
            notes: testCase.notes
          });
        } catch (error) {
          console.warn(`Warning: Could not load ${testId}.json: ${error}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error loading index.json: ${error}`);
  }
  
  return testCases;
}

function calculateAccuracy(
  detectedIssues: IssueCode[],
  expectedIssues: IssueCode[] | undefined
): BenchmarkResult['accuracy'] | undefined {
  if (!expectedIssues || expectedIssues.length === 0) {
    return undefined;
  }
  
  const detectedSet = new Set(detectedIssues);
  const expectedSet = new Set(expectedIssues);
  
  // True positives: issues that were both expected and detected
  const truePositives = expectedIssues.filter(code => detectedSet.has(code)).length;
  
  // False positives: issues detected but not expected
  const falsePositives = detectedIssues.filter(code => !expectedSet.has(code)).length;
  
  // False negatives: issues expected but not detected
  const falseNegatives = expectedIssues.filter(code => !detectedSet.has(code)).length;
  
  // Calculate precision: TP / (TP + FP)
  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives)
    : 0;
  
  // Calculate recall: TP / (TP + FN)
  const recall = truePositives + falseNegatives > 0
    ? truePositives / (truePositives + falseNegatives)
    : 0;
  
  // Calculate F1 score: 2 * (precision * recall) / (precision + recall)
  const f1Score = precision + recall > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;
  
  return {
    precision,
    recall,
    f1Score,
    truePositives,
    falsePositives,
    falseNegatives,
    expectedIssues: Array.from(expectedSet),
    detectedIssues: Array.from(detectedSet)
  };
}

async function runBenchmark(
  testCase: TestCase,
  parameterSet: ParameterSet,
  iterations: number = 1,
  timeout?: number
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      const input: AnalyzeInput = {
        prompt: testCase.prompt,
        messages: testCase.messages,
        schema: testCase.schema,
        model: 'gpt-4o',
        options: parameterSet.options
      };
      
      const startTime = performance.now();
      
      // Add timeout wrapper if timeout is specified
      let report;
      if (timeout && timeout > 0) {
        report = await Promise.race([
          analyzePrompt(input),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Analysis timed out after ${timeout}ms`)), timeout)
          )
        ]);
      } else {
        report = await analyzePrompt(input);
      }
      
      const latency = performance.now() - startTime;
      
      const issuesByCode: Record<string, number> = {};
      const detectedIssueCodes: IssueCode[] = [];
      report.issues.forEach(issue => {
        issuesByCode[issue.code] = (issuesByCode[issue.code] || 0) + 1;
        detectedIssueCodes.push(issue.code);
      });
      
      // Calculate accuracy if expected issues are provided
      const accuracy = calculateAccuracy(detectedIssueCodes, testCase.expectedIssueCodes);
      
      results.push({
        testCaseId: testCase.id,
        parameterSet: parameterSet.name,
        latency,
        issues: {
          total: report.issues.length,
          byCode: issuesByCode,
          details: report.issues.map(issue => ({
            code: issue.code,
            severity: issue.severity,
            confidence: issue.confidence || 'medium',
            detail: issue.detail
          }))
        },
        accuracy,
        cost: report.cost,
        meta: report.meta
      });
    } catch (error) {
      results.push({
        testCaseId: testCase.id,
        parameterSet: parameterSet.name,
        latency: 0,
        issues: {
          total: 0,
          byCode: {},
          details: []
        },
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return results;
}

function generateSummary(
  results: BenchmarkResult[],
  parameterSets: ParameterSet[]
): BenchmarkReport['summary'] {
  const byParameterSet: Record<string, {
    totalRuns: number;
    successRate: number;
    avgLatency: number;
    totalIssues: number;
    issuesByCode: Record<string, number>;
    avgRuleTimings: Record<string, number>;
  }> = {};
  
  const byTestCase: Record<string, {
    runs: number;
    avgLatency: number;
    issuesFound: Record<string, number>;
  }> = {};
  
  // Initialize parameter set summaries
  for (const paramSet of parameterSets) {
    byParameterSet[paramSet.name] = {
      totalRuns: 0,
      successRate: 0,
      avgLatency: 0,
      totalIssues: 0,
      issuesByCode: {},
      avgRuleTimings: {},
      avgAccuracy: {
        precision: 0,
        recall: 0,
        f1Score: 0,
        avgTruePositives: 0,
        avgFalsePositives: 0,
        avgFalseNegatives: 0
      }
    };
  }
  
  // Track accuracy metrics
  const accuracyData: Record<string, Array<{ precision: number; recall: number; f1Score: number; tp: number; fp: number; fn: number }>> = {};
  
  // Process results
  for (const result of results) {
    // Update parameter set summary
    const paramSummary = byParameterSet[result.parameterSet];
    if (paramSummary) {
      paramSummary.totalRuns++;
      if (!result.error) {
        paramSummary.avgLatency = (paramSummary.avgLatency * (paramSummary.totalRuns - 1) + result.latency) / paramSummary.totalRuns;
        paramSummary.totalIssues += result.issues.total;
        
        Object.entries(result.issues.byCode).forEach(([code, count]) => {
          paramSummary.issuesByCode[code] = (paramSummary.issuesByCode[code] || 0) + count;
        });
        
        if (result.meta?.ruleTimings) {
          Object.entries(result.meta.ruleTimings).forEach(([rule, timing]) => {
            const current = paramSummary.avgRuleTimings[rule] || 0;
            const count = paramSummary.totalRuns;
            paramSummary.avgRuleTimings[rule] = (current * (count - 1) + timing) / count;
          });
        }
        
        // Track accuracy if available
        if (result.accuracy) {
          if (!accuracyData[result.parameterSet]) {
            accuracyData[result.parameterSet] = [];
          }
          accuracyData[result.parameterSet].push({
            precision: result.accuracy.precision,
            recall: result.accuracy.recall,
            f1Score: result.accuracy.f1Score,
            tp: result.accuracy.truePositives,
            fp: result.accuracy.falsePositives,
            fn: result.accuracy.falseNegatives
          });
        }
      }
      paramSummary.successRate = (paramSummary.totalRuns - results.filter(r => r.error && r.parameterSet === result.parameterSet).length) / paramSummary.totalRuns;
    }
    
    // Update test case summary
    if (!byTestCase[result.testCaseId]) {
      byTestCase[result.testCaseId] = {
        runs: 0,
        avgLatency: 0,
        issuesFound: {}
      };
    }
    
    const testSummary = byTestCase[result.testCaseId];
    testSummary.runs++;
    testSummary.avgLatency = (testSummary.avgLatency * (testSummary.runs - 1) + result.latency) / testSummary.runs;
    
    Object.entries(result.issues.byCode).forEach(([code, count]) => {
      testSummary.issuesFound[code] = (testSummary.issuesFound[code] || 0) + count;
    });
  }
  
  // Calculate average accuracy metrics for each parameter set
  for (const [paramSetName, accData] of Object.entries(accuracyData)) {
    const paramSummary = byParameterSet[paramSetName];
    if (paramSummary && accData.length > 0) {
      const avgPrecision = accData.reduce((sum, a) => sum + a.precision, 0) / accData.length;
      const avgRecall = accData.reduce((sum, a) => sum + a.recall, 0) / accData.length;
      const avgF1 = accData.reduce((sum, a) => sum + a.f1Score, 0) / accData.length;
      const avgTP = accData.reduce((sum, a) => sum + a.tp, 0) / accData.length;
      const avgFP = accData.reduce((sum, a) => sum + a.fp, 0) / accData.length;
      const avgFN = accData.reduce((sum, a) => sum + a.fn, 0) / accData.length;
      
      paramSummary.avgAccuracy = {
        precision: avgPrecision,
        recall: avgRecall,
        f1Score: avgF1,
        avgTruePositives: avgTP,
        avgFalsePositives: avgFP,
        avgFalseNegatives: avgFN
      };
    }
  }
  
  return { byParameterSet, byTestCase };
}

function generateCSVTable(report: BenchmarkReport, outputPath: string): void {
  const csvLines: string[] = [];
  
  // Header
  csvLines.push('Parameter Set,Avg Latency (ms),Precision,Recall,F1 Score,True Positives,False Positives,False Negatives,Total Issues,Success Rate');
  
  // Data rows
  for (const [paramSetName, stats] of Object.entries(report.summary.byParameterSet)) {
    const accuracy = stats.avgAccuracy;
    const row = [
      paramSetName,
      stats.avgLatency.toFixed(2),
      accuracy ? accuracy.precision.toFixed(3) : 'N/A',
      accuracy ? accuracy.recall.toFixed(3) : 'N/A',
      accuracy ? accuracy.f1Score.toFixed(3) : 'N/A',
      accuracy ? accuracy.avgTruePositives.toFixed(1) : 'N/A',
      accuracy ? accuracy.avgFalsePositives.toFixed(1) : 'N/A',
      accuracy ? accuracy.avgFalseNegatives.toFixed(1) : 'N/A',
      stats.totalIssues.toString(),
      (stats.successRate * 100).toFixed(1) + '%'
    ];
    csvLines.push(row.join(','));
  }
  
  const csvPath = outputPath.replace('.json', '-table.csv');
  writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`📊 CSV table saved to: ${csvPath}`);
}

function generateHTMLChart(report: BenchmarkReport, outputPath: string): void {
  const paramSets = Object.keys(report.summary.byParameterSet);
  const latencies = paramSets.map(name => report.summary.byParameterSet[name].avgLatency);
  const f1Scores = paramSets.map(name => {
    const acc = report.summary.byParameterSet[name].avgAccuracy;
    return acc ? acc.f1Score : 0;
  });
  const precisions = paramSets.map(name => {
    const acc = report.summary.byParameterSet[name].avgAccuracy;
    return acc ? acc.precision : 0;
  });
  const recalls = paramSets.map(name => {
    const acc = report.summary.byParameterSet[name].avgAccuracy;
    return acc ? acc.recall : 0;
  });
  
  // Normalize latencies for chart (0-1 scale)
  const maxLatency = Math.max(...latencies);
  const normalizedLatencies = latencies.map(l => maxLatency > 0 ? l / maxLatency : 0);
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LangPatrol Benchmark Results</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 {
      color: #333;
      border-bottom: 3px solid #4CAF50;
      padding-bottom: 10px;
    }
    .chart-container {
      background: white;
      padding: 20px;
      margin: 20px 0;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .chart-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #555;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      margin: 20px 0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #4CAF50;
      color: white;
      font-weight: 600;
    }
    tr:hover {
      background: #f9f9f9;
    }
    .metric {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      margin: 2px;
    }
    .metric-high { background: #4CAF50; color: white; }
    .metric-medium { background: #FF9800; color: white; }
    .metric-low { background: #f44336; color: white; }
    .info {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      border-left: 4px solid #2196F3;
    }
  </style>
</head>
<body>
  <h1>📊 LangPatrol Benchmark Results</h1>
  
  <div class="info">
    <strong>Generated:</strong> ${new Date(report.metadata.timestamp).toLocaleString()}<br>
    <strong>Dataset:</strong> ${report.metadata.datasetPath}<br>
    <strong>Total Runs:</strong> ${report.metadata.totalRuns}<br>
    <strong>Duration:</strong> ${(report.metadata.duration / 1000).toFixed(2)}s
  </div>
  
  <div class="chart-container">
    <div class="chart-title">⚡ Execution Time vs Accuracy (F1 Score)</div>
    <canvas id="latencyAccuracyChart"></canvas>
  </div>
  
  <div class="chart-container">
    <div class="chart-title">📈 Accuracy Metrics Comparison</div>
    <canvas id="accuracyChart"></canvas>
  </div>
  
  <div class="chart-container">
    <div class="chart-title">⏱️ Execution Time by Parameter Set</div>
    <canvas id="latencyChart"></canvas>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Parameter Set</th>
        <th>Avg Latency (ms)</th>
        <th>Precision</th>
        <th>Recall</th>
        <th>F1 Score</th>
        <th>True Positives</th>
        <th>False Positives</th>
        <th>False Negatives</th>
        <th>Total Issues</th>
        <th>Success Rate</th>
      </tr>
    </thead>
    <tbody>
      ${paramSets.map(name => {
        const stats = report.summary.byParameterSet[name];
        const acc = stats.avgAccuracy;
        const f1Class = acc && acc.f1Score >= 0.8 ? 'metric-high' : acc && acc.f1Score >= 0.6 ? 'metric-medium' : 'metric-low';
        return `<tr>
          <td><strong>${name}</strong></td>
          <td>${stats.avgLatency.toFixed(2)}</td>
          <td>${acc ? acc.precision.toFixed(3) : 'N/A'}</td>
          <td>${acc ? acc.recall.toFixed(3) : 'N/A'}</td>
          <td><span class="metric ${f1Class}">${acc ? acc.f1Score.toFixed(3) : 'N/A'}</span></td>
          <td>${acc ? acc.avgTruePositives.toFixed(1) : 'N/A'}</td>
          <td>${acc ? acc.avgFalsePositives.toFixed(1) : 'N/A'}</td>
          <td>${acc ? acc.avgFalseNegatives.toFixed(1) : 'N/A'}</td>
          <td>${stats.totalIssues}</td>
          <td>${(stats.successRate * 100).toFixed(1)}%</td>
        </tr>`;
      }).join('\n')}
    </tbody>
  </table>
  
  <script>
    const paramSets = ${JSON.stringify(paramSets)};
    const latencies = ${JSON.stringify(latencies)};
    const f1Scores = ${JSON.stringify(f1Scores)};
    const precisions = ${JSON.stringify(precisions)};
    const recalls = ${JSON.stringify(recalls)};
    
    // Latency vs Accuracy Scatter Chart
    new Chart(document.getElementById('latencyAccuracyChart'), {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Parameter Sets',
          data: paramSets.map((name, i) => ({
            x: latencies[i],
            y: f1Scores[i],
            label: name
          })),
          backgroundColor: 'rgba(76, 175, 80, 0.6)',
          borderColor: 'rgba(76, 175, 80, 1)',
          pointRadius: 8,
          pointHoverRadius: 10
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Trade-off: Lower latency vs Higher accuracy'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return paramSets[context.dataIndex] + ': ' + 
                       'Latency: ' + context.parsed.x.toFixed(2) + 'ms, ' +
                       'F1: ' + context.parsed.y.toFixed(3);
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Execution Time (ms)' },
            beginAtZero: true
          },
          y: {
            title: { display: true, text: 'F1 Score' },
            beginAtZero: true,
            max: 1
          }
        }
      }
    });
    
    // Accuracy Metrics Bar Chart
    new Chart(document.getElementById('accuracyChart'), {
      type: 'bar',
      data: {
        labels: paramSets,
        datasets: [
          {
            label: 'Precision',
            data: precisions,
            backgroundColor: 'rgba(33, 150, 243, 0.6)',
            borderColor: 'rgba(33, 150, 243, 1)'
          },
          {
            label: 'Recall',
            data: recalls,
            backgroundColor: 'rgba(255, 152, 0, 0.6)',
            borderColor: 'rgba(255, 152, 0, 1)'
          },
          {
            label: 'F1 Score',
            data: f1Scores,
            backgroundColor: 'rgba(76, 175, 80, 0.6)',
            borderColor: 'rgba(76, 175, 80, 1)'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Accuracy Metrics by Parameter Set'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 1
          }
        }
      }
    });
    
    // Latency Bar Chart
    new Chart(document.getElementById('latencyChart'), {
      type: 'bar',
      data: {
        labels: paramSets,
        datasets: [{
          label: 'Average Latency (ms)',
          data: latencies,
          backgroundColor: paramSets.map((_, i) => {
            const max = Math.max(...latencies);
            const ratio = latencies[i] / max;
            if (ratio < 0.3) return 'rgba(76, 175, 80, 0.6)';
            if (ratio < 0.6) return 'rgba(255, 152, 0, 0.6)';
            return 'rgba(244, 67, 54, 0.6)';
          }),
          borderColor: paramSets.map((_, i) => {
            const max = Math.max(...latencies);
            const ratio = latencies[i] / max;
            if (ratio < 0.3) return 'rgba(76, 175, 80, 1)';
            if (ratio < 0.6) return 'rgba(255, 152, 0, 1)';
            return 'rgba(244, 67, 54, 1)';
          })
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Execution Time by Parameter Set'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Latency (ms)'
            }
          }
        }
      }
    });
  </script>
</body>
</html>`;
  
  const htmlPath = outputPath.replace('.json', '-chart.html');
  writeFileSync(htmlPath, html);
  console.log(`📈 HTML chart saved to: ${htmlPath}`);
}

function generateParameterImpactAnalysis(report: BenchmarkReport, outputPath: string): void {
  const analysis: Array<{
    parameter: string;
    enabled: boolean;
    avgLatency: number;
    avgF1Score: number;
    latencyImpact: string;
    accuracyImpact: string;
  }> = [];
  
  // Extract parameter features from parameter sets
  const paramFeatures: Record<string, { enabled: number; disabled: number; enabledLatency: number[]; disabledLatency: number[]; enabledF1: number[]; disabledF1: number[] }> = {};
  
  for (const paramSet of report.parameterSets) {
    const stats = report.summary.byParameterSet[paramSet.name];
    const latency = stats.avgLatency;
    const f1 = stats.avgAccuracy?.f1Score || 0;
    
    // Check each feature
    const features = [
      'useSemanticSimilarity',
      'useNLIEntailment',
      'useNLPExtraction',
      'useSemanticConflictDetection',
      'useNLIConflictDetection',
      'usePatternMatching',
      'useCombinedScoring'
    ];
    
    for (const feature of features) {
      if (!paramFeatures[feature]) {
        paramFeatures[feature] = {
          enabled: 0,
          disabled: 0,
          enabledLatency: [],
          disabledLatency: [],
          enabledF1: [],
          disabledF1: []
        };
      }
      
      const isEnabled = paramSet.options[feature] === true;
      if (isEnabled) {
        paramFeatures[feature].enabled++;
        paramFeatures[feature].enabledLatency.push(latency);
        paramFeatures[feature].enabledF1.push(f1);
      } else {
        paramFeatures[feature].disabled++;
        paramFeatures[feature].disabledLatency.push(latency);
        paramFeatures[feature].disabledF1.push(f1);
      }
    }
  }
  
  // Calculate impact
  for (const [feature, data] of Object.entries(paramFeatures)) {
    if (data.enabled > 0 && data.disabled > 0) {
      const avgEnabledLatency = data.enabledLatency.reduce((a, b) => a + b, 0) / data.enabledLatency.length;
      const avgDisabledLatency = data.disabledLatency.reduce((a, b) => a + b, 0) / data.disabledLatency.length;
      const avgEnabledF1 = data.enabledF1.reduce((a, b) => a + b, 0) / data.enabledF1.length;
      const avgDisabledF1 = data.disabledF1.reduce((a, b) => a + b, 0) / data.disabledF1.length;
      
      const latencyDiff = avgEnabledLatency - avgDisabledLatency;
      const latencyPercent = ((latencyDiff / avgDisabledLatency) * 100).toFixed(1);
      const f1Diff = avgEnabledF1 - avgDisabledF1;
      const f1Percent = ((f1Diff / (avgDisabledF1 || 1)) * 100).toFixed(1);
      
      analysis.push({
        parameter: feature,
        enabled: true,
        avgLatency: avgEnabledLatency,
        avgF1Score: avgEnabledF1,
        latencyImpact: `${latencyDiff > 0 ? '+' : ''}${latencyPercent}%`,
        accuracyImpact: `${f1Diff > 0 ? '+' : ''}${f1Percent}%`
      });
    }
  }
  
  // Generate CSV
  const csvLines = ['Parameter,Avg Latency (ms),Avg F1 Score,Latency Impact,Accuracy Impact'];
  analysis.forEach(a => {
    csvLines.push(`${a.parameter},${a.avgLatency.toFixed(2)},${a.avgF1Score.toFixed(3)},${a.latencyImpact},${a.accuracyImpact}`);
  });
  
  const csvPath = outputPath.replace('.json', '-parameter-impact.csv');
  writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`📊 Parameter impact analysis saved to: ${csvPath}`);
}

async function runBenchmarkSuite(config: BenchmarkConfig): Promise<BenchmarkReport> {
  const startTime = performance.now();
  
  console.log('🚀 Starting benchmark suite...');
  console.log(`📁 Dataset: ${config.datasetPath}`);
  console.log(`📊 Parameter sets: ${config.parameterSets.length}`);
  
  // Load test cases
  let testCases: TestCase[] = [];
  const stats = statSync(config.datasetPath);
  
  if (stats.isFile() && config.datasetPath.endsWith('.csv')) {
    console.log('📄 Loading CSV dataset...');
    testCases = parseCsv(config.datasetPath);
  } else if (stats.isDirectory()) {
    // Check if it's a JSON dataset (has index.json)
    const indexPath = join(config.datasetPath, 'index.json');
    if (existsSync(indexPath)) {
      console.log('📂 Loading JSON dataset...');
      testCases = loadJsonDataset(config.datasetPath);
    } else {
    console.log('📂 Loading text files from directory...');
    testCases = loadTextFiles(config.datasetPath);
    }
  } else if (stats.isFile() && config.datasetPath.endsWith('.txt')) {
    console.log('📄 Loading single text file...');
    const content = readFileSync(config.datasetPath, 'utf-8');
    testCases = [{
      id: config.datasetPath.split('/').pop()?.replace('.txt', '') || 'test',
      prompt: content,
      category: 'synthetic'
    }];
  } else {
    throw new Error(`Dataset path not found or unsupported format: ${config.datasetPath}`);
  }
  
  console.log(`✅ Loaded ${testCases.length} test cases`);
  
  // Warmup runs
  if (config.warmupRuns && config.warmupRuns > 0) {
    console.log(`🔥 Running ${config.warmupRuns} warmup runs...`);
    for (let i = 0; i < config.warmupRuns; i++) {
      if (testCases.length > 0) {
        await analyzePrompt({
          prompt: testCases[0].prompt || 'warmup',
          options: config.parameterSets[0]?.options || {}
        });
      }
    }
    console.log('✅ Warmup complete');
  }
  
  // Run benchmarks
  const allResults: BenchmarkResult[] = [];
  const iterations = config.iterations || 1;
  const totalRuns = testCases.length * config.parameterSets.length * iterations;
  const concurrency = config.concurrency || 1;
  const timeout = config.timeout;
  
  console.log(`\n📈 Running ${totalRuns} benchmark runs...`);
  if (concurrency > 1) {
    console.log(`⚡ Using parallel execution with concurrency: ${concurrency}`);
  }
  if (timeout) {
    console.log(`⏱️  Timeout per analysis: ${timeout}ms`);
  }
  
  // Create all benchmark tasks
  const tasks: Array<{ testCase: TestCase; parameterSet: ParameterSet; index: number }> = [];
  for (const testCase of testCases) {
    for (const parameterSet of config.parameterSets) {
      tasks.push({ testCase, parameterSet, index: tasks.length });
    }
  }
  
  // Execute with concurrency control
  let currentRun = 0;
  let lastUpdateTime = 0;
  const updateProgress = (task: { testCase: TestCase; parameterSet: ParameterSet }, completed: number) => {
    // Throttle progress updates to avoid too much console output
    const now = Date.now();
    if (now - lastUpdateTime < 100) {
      return; // Skip update if less than 100ms since last update
    }
    lastUpdateTime = now;
    
    const progress = ((completed / totalRuns) * 100).toFixed(1);
    const testCaseName = task.testCase.id.length > 30 
      ? task.testCase.id.substring(0, 30) + '...' 
      : task.testCase.id;
    process.stdout.write(
      `\r⏳ Progress: ${progress}% (${completed}/${totalRuns}) | ` +
      `Running: ${testCaseName} @ ${task.parameterSet.name}`
    );
  };
  
  // Process tasks with concurrency limit
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchPromises = batch.map(async (task) => {
      const results = await runBenchmark(task.testCase, task.parameterSet, iterations, timeout);
      currentRun += iterations;
      updateProgress(task, currentRun);
      return results;
    });
    
    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults.flat());
    }
  
  // Final progress update
  process.stdout.write(`\r⏳ Progress: 100.0% (${totalRuns}/${totalRuns}) | Complete${' '.repeat(50)}\n`);
  
  console.log('\n✅ Benchmark runs complete');
  
  // Generate summary
  console.log('📊 Generating summary...');
  const summary = generateSummary(allResults, config.parameterSets);
  
  const duration = performance.now() - startTime;
  
  const report: BenchmarkReport = {
    metadata: {
      timestamp: new Date().toISOString(),
      datasetPath: config.datasetPath,
      totalTestCases: testCases.length,
      totalParameterSets: config.parameterSets.length,
      totalRuns: allResults.length,
      duration
    },
    parameterSets: config.parameterSets.map(ps => ({
      name: ps.name,
      description: ps.description,
      options: ps.options
    })),
    results: allResults,
    summary
  };
  
  // Save report
  console.log(`💾 Saving report to ${config.outputPath}...`);
  writeFileSync(config.outputPath, JSON.stringify(report, null, 2));
  console.log('✅ Report saved');
  
  // Generate tables and charts
  console.log('\n📊 Generating tables and charts...');
  generateCSVTable(report, config.outputPath);
  generateHTMLChart(report, config.outputPath);
  generateParameterImpactAnalysis(report, config.outputPath);
  console.log('✅ All reports generated');
  
  // Print summary
  console.log('\n📊 Summary:');
  console.log(`   Total runs: ${allResults.length}`);
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`   Avg latency: ${(allResults.reduce((sum, r) => sum + r.latency, 0) / allResults.length).toFixed(2)}ms`);
  console.log(`   Success rate: ${((allResults.filter(r => !r.error).length / allResults.length) * 100).toFixed(1)}%`);
  
  console.log('\n📈 By Parameter Set:');
  Object.entries(summary.byParameterSet).forEach(([name, stats]) => {
    console.log(`   ${name}:`);
    console.log(`     Runs: ${stats.totalRuns}`);
    console.log(`     Avg Latency: ${stats.avgLatency.toFixed(2)}ms`);
    console.log(`     Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
    console.log(`     Total Issues: ${stats.totalIssues}`);
    if (stats.avgAccuracy) {
      console.log(`     Precision: ${stats.avgAccuracy.precision.toFixed(3)}`);
      console.log(`     Recall: ${stats.avgAccuracy.recall.toFixed(3)}`);
      console.log(`     F1 Score: ${stats.avgAccuracy.f1Score.toFixed(3)}`);
    }
  });
  
  return report;
}

// Default parameter sets for benchmarking
const defaultParameterSets: ParameterSet[] = [
  {
    name: 'baseline',
    description: 'Baseline - pattern matching only',
    options: {
      useSemanticSimilarity: false,
      useNLIEntailment: false,
      useNLPExtraction: false,
      useSemanticConflictDetection: false,
      useNLIConflictDetection: false,
      usePatternMatching: true
    }
  },
  {
    name: 'semantic-similarity',
    description: 'Semantic similarity enabled',
    options: {
      useSemanticSimilarity: true,
      useNLIEntailment: false,
      similarityThreshold: 0.6,
      usePatternMatching: true
    }
  },
  {
    name: 'nli-entailment',
    description: 'NLI entailment enabled',
    options: {
      useSemanticSimilarity: false,
      useNLIEntailment: true,
      similarityThreshold: 0.6,
      usePatternMatching: true
    }
  },
  {
    name: 'semantic-nli-combined',
    description: 'Both semantic similarity and NLI enabled',
    options: {
      useSemanticSimilarity: true,
      useNLIEntailment: true,
      similarityThreshold: 0.6,
      usePatternMatching: true
    }
  },
  {
    name: 'nlp-extraction',
    description: 'NLP extraction enabled',
    options: {
      useNLPExtraction: true,
      usePatternMatching: true
    }
  },
  {
    name: 'conflict-semantic',
    description: 'Conflict detection with semantic similarity',
    options: {
      useSemanticConflictDetection: true,
      conflictSimilarityThreshold: 0.3,
      usePatternMatching: true
    }
  },
  {
    name: 'conflict-nli',
    description: 'Conflict detection with NLI',
    options: {
      useNLIConflictDetection: true,
      conflictContradictionThreshold: 0.7,
      usePatternMatching: true
    }
  },
  {
    name: 'all-features',
    description: 'All features enabled',
    options: {
      useSemanticSimilarity: true,
      useNLIEntailment: true,
      useNLPExtraction: true,
      useSemanticConflictDetection: true,
      useNLIConflictDetection: true,
      similarityThreshold: 0.6,
      conflictSimilarityThreshold: 0.3,
      conflictContradictionThreshold: 0.7,
      usePatternMatching: true
    }
  }
];

function findGeneratedDataset(): string | null {
  // Look for generated datasets in datasets/ directory
  const datasetsDir = join(dirname(fileURLToPath(import.meta.url)), '../../datasets');
  
  if (!existsSync(datasetsDir)) {
    return null;
  }
  
  // Look for directories with index.json (JSON datasets)
  const subdirs = readdirSync(datasetsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  // Prefer directories with index.json (generated datasets)
  for (const subdir of subdirs) {
    const indexPath = join(datasetsDir, subdir, 'index.json');
    if (existsSync(indexPath)) {
      return join(datasetsDir, subdir);
    }
  }
  
  // Fallback: look for generator directory
  const generatorDir = join(datasetsDir, 'generator');
  if (existsSync(generatorDir)) {
    const generatorSubdirs = readdirSync(generatorDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    for (const subdir of generatorSubdirs) {
      const indexPath = join(generatorDir, subdir, 'index.json');
      if (existsSync(indexPath)) {
        return join(generatorDir, subdir);
      }
    }
  }
  
  return null;
}

function generateResultsPath(datasetPath: string, timestamp: string): string {
  const benchmarkDir = dirname(fileURLToPath(import.meta.url));
  const resultsDir = join(benchmarkDir, '../../benchmark-results');
  
  // Create results directory if it doesn't exist
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }
  
  // Extract dataset name from path
  const datasetName = datasetPath.split('/').pop() || 'unknown';
  
  // Create filename with timestamp
  const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `${datasetName}-${dateStr}.json`;
  
  return join(resultsDir, filename);
}

function saveParameterConfig(resultsPath: string, parameterSets: ParameterSet[]): void {
  // Save parameter configuration alongside results
  const configPath = resultsPath.replace('.json', '-config.json');
  const config = {
    timestamp: new Date().toISOString(),
    parameterSets: parameterSets.map(ps => ({
      name: ps.name,
      description: ps.description,
      options: ps.options
    }))
  };
  
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function loadHistoricalResults(resultsDir: string): BenchmarkReport[] {
  const reports: BenchmarkReport[] = [];
  
  if (!existsSync(resultsDir)) {
    return reports;
  }
  
  const files = readdirSync(resultsDir)
    .filter(f => f.endsWith('.json') && !f.endsWith('-config.json'))
    .sort()
    .reverse(); // Most recent first
  
  for (const file of files.slice(0, 10)) { // Load last 10 runs
    try {
      const content = readFileSync(join(resultsDir, file), 'utf-8');
      const report = JSON.parse(content) as BenchmarkReport;
      reports.push(report);
    } catch (error) {
      console.warn(`Warning: Could not load ${file}: ${error}`);
    }
  }
  
  return reports;
}

function generateParameterImpactReport(
  currentReport: BenchmarkReport,
  historicalReports: BenchmarkReport[]
): void {
  const resultsDir = dirname(currentReport.metadata.timestamp ? 
    generateResultsPath('', currentReport.metadata.timestamp) : 
    join(dirname(fileURLToPath(import.meta.url)), '../../benchmark-results'));
  
  const impactPath = join(resultsDir, 'parameter-impact-history.json');
  
  // Analyze parameter impact across all reports
  const parameterStats: Record<string, {
    runs: number;
    avgLatency: number[];
    avgF1Score: number[];
    avgPrecision: number[];
    avgRecall: number[];
    timestamps: string[];
  }> = {};
  
  const allReports = [currentReport, ...historicalReports];
  
  for (const report of allReports) {
    for (const [paramSetName, stats] of Object.entries(report.summary.byParameterSet)) {
      if (!parameterStats[paramSetName]) {
        parameterStats[paramSetName] = {
          runs: 0,
          avgLatency: [],
          avgF1Score: [],
          avgPrecision: [],
          avgRecall: [],
          timestamps: []
        };
      }
      
      parameterStats[paramSetName].runs += stats.totalRuns;
      parameterStats[paramSetName].avgLatency.push(stats.avgLatency);
      parameterStats[paramSetName].timestamps.push(report.metadata.timestamp);
      
      if (stats.avgAccuracy) {
        parameterStats[paramSetName].avgF1Score.push(stats.avgAccuracy.f1Score);
        parameterStats[paramSetName].avgPrecision.push(stats.avgAccuracy.precision);
        parameterStats[paramSetName].avgRecall.push(stats.avgAccuracy.recall);
      }
    }
  }
  
  // Calculate trends
  const impactReport = {
    generatedAt: new Date().toISOString(),
    totalReports: allReports.length,
    parameterStats: Object.entries(parameterStats).map(([name, stats]) => ({
      name,
      totalRuns: stats.runs,
      avgLatency: {
        current: stats.avgLatency[0] || 0,
        average: stats.avgLatency.reduce((a, b) => a + b, 0) / stats.avgLatency.length || 0,
        trend: stats.avgLatency.length > 1 ? 
          (stats.avgLatency[0] - stats.avgLatency[stats.avgLatency.length - 1]) : 0
      },
      avgF1Score: {
        current: stats.avgF1Score[0] || 0,
        average: stats.avgF1Score.reduce((a, b) => a + b, 0) / stats.avgF1Score.length || 0,
        trend: stats.avgF1Score.length > 1 ? 
          (stats.avgF1Score[0] - stats.avgF1Score[stats.avgF1Score.length - 1]) : 0
      },
      avgPrecision: {
        current: stats.avgPrecision[0] || 0,
        average: stats.avgPrecision.reduce((a, b) => a + b, 0) / stats.avgPrecision.length || 0,
        trend: stats.avgPrecision.length > 1 ? 
          (stats.avgPrecision[0] - stats.avgPrecision[stats.avgPrecision.length - 1]) : 0
      },
      avgRecall: {
        current: stats.avgRecall[0] || 0,
        average: stats.avgRecall.reduce((a, b) => a + b, 0) / stats.avgRecall.length || 0,
        trend: stats.avgRecall.length > 1 ? 
          (stats.avgRecall[0] - stats.avgRecall[stats.avgRecall.length - 1]) : 0
      }
    }))
  };
  
  writeFileSync(impactPath, JSON.stringify(impactReport, null, 2));
  console.log(`📈 Parameter impact history saved to: ${impactPath}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const benchmarkDir = dirname(fileURLToPath(import.meta.url));
  let datasetPath: string | undefined;
  let outputPath: string | undefined;
  let useDefaultParams = true;
  let customParamsPath: string | undefined;
  let warmupRuns = 1;
  let iterations = 1;
  let concurrency = 1;
  let timeout: number | undefined;
  let autoDetectDataset = true;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dataset':
        datasetPath = args[++i];
        break;
      case '--output':
        outputPath = args[++i];
        break;
      case '--params':
        customParamsPath = args[++i];
        useDefaultParams = false;
        break;
      case '--warmup':
        warmupRuns = parseInt(args[++i], 10);
        break;
      case '--iterations':
        iterations = parseInt(args[++i], 10);
        break;
      case '--concurrency':
        concurrency = parseInt(args[++i], 10);
        if (concurrency < 1) {
          console.error('❌ Concurrency must be at least 1');
          process.exit(1);
        }
        break;
      case '--timeout':
        timeout = parseInt(args[++i], 10);
        if (timeout < 1) {
          console.error('❌ Timeout must be at least 1ms');
          process.exit(1);
        }
        break;
      case '--no-auto-dataset':
        autoDetectDataset = false;
        break;
      case '--help':
        console.log(`
Benchmark Tool for LangPatrol

Usage:
  tsx tools/benchmark/benchmark.ts [options]

Options:
  --dataset <path>     Path to dataset (CSV file, JSON directory, or .txt files)
                        If not provided, auto-detects generated datasets
  --output <path>       Path to save benchmark report JSON
                        Default: auto-generated in benchmark-results/ directory
  --params <path>       Path to custom parameter sets JSON file
                        If not provided, uses default parameter sets
  --warmup <number>     Number of warmup runs (default: 1)
  --iterations <number> Number of iterations per test case (default: 1)
  --concurrency <num>   Number of parallel analyses to run (default: 1)
                        Use higher values for faster execution (e.g., 4-8)
  --timeout <ms>        Timeout per analysis in milliseconds (default: no timeout)
                        Useful for preventing hangs on large prompts
  --no-auto-dataset     Disable automatic dataset detection
  --help               Show this help message

Examples:
  # Run with auto-detected generated dataset
  tsx tools/benchmark/benchmark.ts

  # Run with custom dataset
  tsx tools/benchmark/benchmark.ts --dataset datasets/synthetic/20k_tokens_prompt.txt

  # Run with custom parameters
  tsx tools/benchmark/benchmark.ts --params custom-params.json

  # Run with multiple iterations
  tsx tools/benchmark/benchmark.ts --iterations 3 --warmup 2

  # Run with parallel execution (faster for large datasets)
  tsx tools/benchmark/benchmark.ts --concurrency 4

  # Run with timeout to prevent hangs on large prompts
  tsx tools/benchmark/benchmark.ts --timeout 300000 --concurrency 2
        `);
        process.exit(0);
    }
  }
  
  // Auto-detect dataset if not provided
  if (!datasetPath && autoDetectDataset) {
    const foundDataset = findGeneratedDataset();
    if (foundDataset) {
      datasetPath = foundDataset;
      console.log(`📂 Auto-detected dataset: ${datasetPath}`);
    } else {
      console.warn(`⚠️  No generated dataset found, using default`);
      datasetPath = join(benchmarkDir, '../../datasets/synthetic/synthetic_validation_dataset.csv');
    }
  } else if (!datasetPath) {
    datasetPath = join(benchmarkDir, '../../datasets/synthetic/synthetic_validation_dataset.csv');
  }
  
  // Load parameter sets
  let parameterSets: ParameterSet[] = defaultParameterSets;
  if (customParamsPath && existsSync(customParamsPath)) {
    const paramsData = readFileSync(customParamsPath, 'utf-8');
    parameterSets = JSON.parse(paramsData);
  } else if (customParamsPath) {
    console.error(`❌ Parameter file not found: ${customParamsPath}`);
    process.exit(1);
  }
  
  // Resolve paths
  const resolvedDatasetPath = resolve(datasetPath);
  
  // Generate output path with timestamp if not provided
  const timestamp = new Date().toISOString();
  const resolvedOutputPath = outputPath ? resolve(outputPath) : generateResultsPath(resolvedDatasetPath, timestamp);
  
  // Create output directory if needed
  const outputDir = dirname(resolvedOutputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const config: BenchmarkConfig = {
    datasetPath: resolvedDatasetPath,
    outputPath: resolvedOutputPath,
    parameterSets,
    warmupRuns,
    iterations,
    concurrency,
    timeout
  };
  
  try {
    const report = await runBenchmarkSuite(config);
    
    // Save parameter configuration
    saveParameterConfig(resolvedOutputPath, parameterSets);
    
    // Load historical results and generate impact report
    const resultsDirPath = dirname(resolvedOutputPath);
    const historicalReports = loadHistoricalResults(resultsDirPath);
    generateParameterImpactReport(report, historicalReports, resultsDirPath);
    
    console.log('\n✅ Benchmark suite completed successfully');
    console.log(`\n📊 Results saved to: ${resolvedOutputPath}`);
    console.log(`📋 Parameter config saved to: ${resolvedOutputPath.replace('.json', '-config.json')}`);
    console.log(`📈 Parameter impact history updated`);
  } catch (error) {
    console.error('\n❌ Benchmark suite failed:', error);
    process.exit(1);
  }
}

// Run if executed directly (check if this file is being run)
const isMainModule = process.argv[1]?.includes('benchmark.ts') || 
                      process.argv[1]?.endsWith('benchmark.js') ||
                      import.meta.url.endsWith('benchmark.ts');

if (isMainModule || !import.meta.url.includes('node_modules')) {
  main().catch(console.error);
}

export { runBenchmarkSuite, type BenchmarkConfig, type ParameterSet, type BenchmarkReport, type BenchmarkResult };

