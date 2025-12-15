/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { 
  analyze, 
  type AnalyzeInput, 
  type Report,
  type IssueCode,
  runReferenceAsync,
  runConflictsAsync,
  isSemanticSimilarityAvailable,
  isNLIEntailmentAvailable,
  extractText,
  createIssueId,
  createPreview
} from '@langpatrol/engine';

/**
 * Call the cloud API to analyze a prompt
 */
async function analyzePromptCloud(input: AnalyzeInput, apiKey: string, baseUrl: string): Promise<Report> {
  // Remove apiKey and apiBaseUrl from the request body
  const { options, ...restInput } = input;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKey: _apiKey, apiBaseUrl: _apiBaseUrl, ...restOptions } = options || {};
  
  const requestBody: AnalyzeInput = {
    ...restInput,
    options: Object.keys(restOptions || {}).length > 0 ? restOptions : undefined
  };

  const url = `${baseUrl}/api/v1/analyze`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
    }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Simple regex-based PII detection for local use (when no API key is provided)
 */
function detectPIIRegex(text: string): Array<{ key: string; value: string; start: number; end: number }> {
  const detections: Array<{ key: string; value: string; start: number; end: number }> = [];
  const seen = new Set<string>();

  const collect = (regex: RegExp, key: string) => {
    let match: RegExpExecArray | null;
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    while ((match = re.exec(text)) !== null) {
      const value = match[0];
      if (!seen.has(value)) {
        seen.add(value);
        detections.push({
          key,
          value,
          start: match.index,
          end: match.index + value.length
        });
      }
    }
  };

  // Email addresses
  collect(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'EMAIL');

  // Phone numbers (simple, international friendly)
  collect(/\b\+?\d[\d\s().-]{6,}\d\b/g, 'PHONE');

  // Credit card numbers (basic 13-16 digits, spaced or dashed)
  collect(/\b(?:\d[ -]*?){13,16}\b/g, 'CARD');

  // SSN-like patterns
  collect(/\b\d{3}-\d{2}-\d{4}\b/g, 'SSN');

  // "My name is X" -> extract the name part
  const nameRe = /\bmy name is\s+([A-Z][a-zA-Z''-]{1,40}(?:\s[A-Z][a-zA-Z''-]{1,40})?)/gi;
  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = nameRe.exec(text)) !== null) {
    const name = nameMatch[1];
    if (!seen.has(name)) {
      seen.add(name);
      detections.push({
        key: 'NAME',
        value: name,
        start: nameMatch.index + nameMatch[0].indexOf(name),
        end: nameMatch.index + nameMatch[0].indexOf(name) + name.length
      });
    }
  }

  // Filter out trivially short or numeric-only values (false positives)
  return detections.filter((d) => {
    const val = d.value.trim();
    if (!val || val.length < 2) return false;
    if (/^\d{1,5}$/.test(val)) return false; // skip small numbers like "4", "16722"
    return true;
  });
}

/**
 * Add PII detection issues to the report when no API key is provided
 */
function addPIIDetection(input: AnalyzeInput, report: Report): void {
  const text = extractText(input);
  if (!text) return;

  const detections = detectPIIRegex(text);
  if (detections.length === 0) return;

  // Group by category
  const byCategory = new Map<string, Array<{ value: string; start: number; end: number }>>();
  for (const d of detections) {
    const existing = byCategory.get(d.key) || [];
    existing.push({ value: d.value, start: d.start, end: d.end });
    byCategory.set(d.key, existing);
  }

  // Create summary and occurrences
  const summary = Array.from(byCategory.entries()).map(([key, values]) => ({
    text: key,
    count: values.length
  }));

  const occurrences = detections
    .slice(0, 50)
    .map((d) => ({
      text: d.value,
      start: d.start,
      end: d.end,
      preview: createPreview(text, d.start, d.end)
    }));

  const issueId = createIssueId();
  report.issues.push({
    id: issueId,
    code: 'PII_DETECTED',
    severity: 'medium',
    detail: `Detected personally identifiable information (PII): ${summary
      .map((s) => `${s.text}${s.count > 1 ? ` (×${s.count})` : ''}`)
      .join(', ')}`,
    evidence: {
      summary,
      occurrences,
      firstSeenAt: {
        char: Math.min(...detections.map((d) => d.start))
      }
    },
    scope: input.messages && input.messages.length > 0
      ? { type: 'messages', messageIndex: input.messages.length - 1 }
      : { type: 'prompt' },
    confidence: 'high'
  });
}

export async function analyzePrompt(input: AnalyzeInput): Promise<Report> {
  // If apiKey is provided, route to cloud API
  if (input.options?.apiKey) {
    const apiKey = input.options.apiKey;
    const baseUrl = input.options.apiBaseUrl || 'http://localhost:3000';
    
    console.log('[analyzePrompt] Routing to cloud API:', baseUrl);
    return analyzePromptCloud(input, apiKey, baseUrl);
  }
  // Check if semantic/NLI features are enabled
  const useSemanticFeatures = 
    input.options?.similarityThreshold !== undefined ||
    input.options?.useSemanticSimilarity === true ||
    input.options?.useNLIEntailment === true;
  
  const semanticAvailable = useSemanticFeatures && 
    (isSemanticSimilarityAvailable() || isNLIEntailmentAvailable());
  
  console.log('[analyzePrompt] useSemanticFeatures:', useSemanticFeatures);
  console.log('[analyzePrompt] semanticAvailable:', semanticAvailable);
  console.log('[analyzePrompt] disabledRules:', input.options?.disabledRules);
  console.log('[analyzePrompt] MISSING_REFERENCE disabled?', input.options?.disabledRules?.includes('MISSING_REFERENCE'));
  
  // If semantic features are enabled, use async version for reference rule
  if (semanticAvailable && !input.options?.disabledRules?.includes('MISSING_REFERENCE')) {
    console.log('[analyzePrompt] Using async version with semantic features');
    // Temporarily disable MISSING_REFERENCE in analyze() to avoid running it twice
    const inputWithDisabledRef: AnalyzeInput = {
      ...input,
      options: {
        ...input.options,
        disabledRules: [...(input.options?.disabledRules || []), 'MISSING_REFERENCE' as IssueCode]
      }
    };
    
    // Create report with all other rules first (synchronous)
    const report = analyze(inputWithDisabledRef);
    console.log('[analyzePrompt] Report created, issues before async:', report.issues.length);
    
    // Then run the reference rule with async semantic/NLI checking
    console.log('[analyzePrompt] Calling runReferenceAsync...');
    await runReferenceAsync(input, report);
    console.log('[analyzePrompt] runReferenceAsync completed, issues after:', report.issues.length);
    
    // Run conflicts rule with async semantic/NLI checking if enabled
    if (!input.options?.disabledRules?.includes('CONFLICTING_INSTRUCTION')) {
      const useConflictSemantic = input.options?.useSemanticConflictDetection === true;
      const useConflictNLI = input.options?.useNLIConflictDetection === true;
      
      if (useConflictSemantic || useConflictNLI) {
        console.log('[analyzePrompt] Calling runConflictsAsync...');
        await runConflictsAsync(input, report);
        console.log('[analyzePrompt] runConflictsAsync completed');
      }
    }
    
    // Add PII detection if not disabled
    if (!input.options?.disabledRules?.includes('PII_DETECTED')) {
      addPIIDetection(input, report);
    }
    
    // Ensure meta exists with required fields
    if (!report.meta) {
      report.meta = {
        latencyMs: 0
      };
    }
    // Ensure modelHint is set if not already present
    if (input.model && !report.meta.modelHint) {
      report.meta.modelHint = input.model;
    }
    return report;
  }
  
  console.log('[analyzePrompt] Using standard synchronous analyze');
  // Otherwise use standard synchronous analyze
  const report = analyze(input);
  
  // Add PII detection if not disabled
  if (!input.options?.disabledRules?.includes('PII_DETECTED')) {
    addPIIDetection(input, report);
  }
  
  // Ensure meta exists with required fields
  if (!report.meta) {
    report.meta = {
      latencyMs: 0
    };
  }
  // Ensure modelHint is set if not already present
  if (input.model && !report.meta.modelHint) {
    report.meta.modelHint = input.model;
  }
  return report;
}

