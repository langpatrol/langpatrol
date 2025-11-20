/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import { 
  analyze, 
  type AnalyzeInput, 
  type Report,
  type IssueCode,
  runReferenceAsync,
  runConflictsAsync,
  isSemanticSimilarityAvailable,
  isNLIEntailmentAvailable
} from '@langpatrol/engine';

/**
 * Call the cloud API to analyze a prompt
 */
async function analyzePromptCloud(input: AnalyzeInput, apiKey: string, baseUrl: string): Promise<Report> {
  // Remove apiKey and apiBaseUrl from the request body
  const { options, ...restInput } = input;
  const { apiKey: _, apiBaseUrl: __, ...restOptions } = options || {};
  
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

