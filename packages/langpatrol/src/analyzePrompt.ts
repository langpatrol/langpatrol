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
 * Simple regex-based security threat detection for local use (when no API key is provided)
 */
function detectSecurityThreatsRegex(text: string): Array<{ pattern: string; value: string; start: number; end: number }> {
  const detections: Array<{ pattern: string; value: string; start: number; end: number }> = [];
  const seen = new Set<string>();

  const collect = (regex: RegExp, pattern: string) => {
    let match: RegExpExecArray | null;
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    while ((match = re.exec(text)) !== null) {
      const value = match[0];
      // Use a normalized key to avoid duplicates
      const key = `${pattern}:${value.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        detections.push({
          pattern,
          value,
          start: match.index,
          end: match.index + value.length
        });
      }
    }
  };

  // Prompt injection patterns - instructions to ignore/override (more flexible)
  // Pattern 1: "ignore [word] [instruction]" - catches "ignore previous instruction", "ignore all instruction", etc.
  collect(/\b(ignore|disregard|forget|override|skip|bypass|neglect|abandon)\s+(\w+\s+)?(previous|prior|earlier|above|all|the|your|system|initial|original|earlier|past|before|any)\s+(instructions?|prompts?|rules?|directives?|commands?|messages?|guidelines?|policies?|constraints?|requirements?|restrictions?|limitations?)\b/gi, 'IGNORE_INSTRUCTIONS');
  // Pattern 2: "ignore all previous" - catches "ignore all previous instruction"
  collect(/\b(ignore|disregard|forget|override|skip|bypass)\s+(all|everything|any|each|every)\s+(previous|prior|earlier|above|before|past|the|your)\s+(instructions?|prompts?|rules?|directives?|commands?|messages?|guidelines?|policies?|constraints?|requirements?|instruction|prompt|rule|directive|command|message|guideline|policy|constraint|requirement)\b/gi, 'IGNORE_INSTRUCTIONS');
  // Pattern 3: "ignore everything above/before"
  collect(/\b(ignore|disregard|forget|override)\s+(everything|all|what|anything|all\s+of|each|every)\s+(above|before|earlier|said|mentioned|written|stated|told|given|provided|specified|defined)\b/gi, 'IGNORE_INSTRUCTIONS');
  // Pattern 4: "ignore [word] commands/requests"
  collect(/\b(ignore|disregard|forget|override|skip|bypass)\s+(\w+\s+)?(previous|prior|earlier|above|all|the|your|any|all\s+of)\s+(commands?|requests?|orders?|directions?|steps?|tasks?|instructions?)\b/gi, 'IGNORE_INSTRUCTIONS');
  collect(/\b(you\s+are|act\s+as|pretend\s+you\s+are|roleplay\s+as|imagine\s+you\s+are|you\s+must\s+act\s+as|behave\s+as|play\s+the\s+role\s+of)\s+(a|an|the)?\s*[^.!?]+(now|immediately|from\s+now\s+on|starting\s+now)\b/gi, 'ROLE_MANIPULATION');
  collect(/\b(forget|erase|delete|remove|clear|discard|abandon)\s+(your|the|all|any)\s+(system|initial|original|previous|prior|earlier|above|default)\s+(prompt|instructions?|rules?|directives?|guidelines?|policies?|constraints?|context|memory|settings?|configuration)\b/gi, 'FORGET_PROMPT');
  
  // Jailbreak attempts
  collect(/\b(bypass|circumvent|avoid|skip|ignore|evade|escape|get\s+around)\s+(safety|security|content|filter|restriction|policy|guideline|constraint|limit|protection|guard|moderation|safeguard|check|validation)\b/gi, 'JAILBREAK');
  collect(/\b(you\s+can|you\s+are\s+allowed|you\s+have\s+permission|it\s+is\s+ok|it\s+is\s+fine|it\s+is\s+acceptable|it's\s+ok|it's\s+fine|it's\s+acceptable)\s+to\s+(ignore|bypass|circumvent|violate|break|disregard|override)\b/gi, 'JAILBREAK');
  
  // Data exfiltration attempts - more flexible patterns (allow optional words like "with", "the", etc.)
  collect(/\b(output|print|display|show|reveal|expose|share|tell|give|provide|send|return|write|list|dump|leak|disclose|unveil)\s+(me|us|the\s+user|your|the)\s+(system|initial|original|previous|prior|earlier|above|full|complete|entire|all|any|hidden|secret|confidential|private|internal|sensitive)\s+(prompt|instructions?|rules?|directives?|guidelines?|policies?|constraints?|context|memory|training\s+data|dataset|knowledge\s+base|details?|information|data|content)\b/gi, 'DATA_EXFILTRATION');
  collect(/\b(what\s+are|tell\s+me|show\s+me|give\s+me|what\s+is|what\s+were|what\s+was|reveal|expose|share|provide)\s+(your|the|your\s+original|your\s+initial|your\s+system|your\s+previous|your\s+prior|your\s+earlier|your\s+above|the\s+hidden|the\s+secret|the\s+confidential|the\s+private|the\s+internal)\s+(prompt|instructions?|rules?|directives?|guidelines?|policies?|constraints?|context|memory|details?|information|data)\b/gi, 'DATA_EXFILTRATION');
  collect(/\b(provide|give|show|tell|reveal|share|expose|disclose|unveil)\s+(me|us|the\s+user|your)\s+(\w+\s+)?(hidden|secret|confidential|private|internal|sensitive|restricted|classified|protected|undisclosed)\s+(details?|information|data|content|facts?|secrets?|instructions?|prompts?|rules?|directives?|guidelines?|policies?)\b/gi, 'DATA_EXFILTRATION');
  collect(/\b(provide|give|show|tell|reveal|share|expose|disclose|unveil)\s+(me|us|the\s+user|your)\s+(with\s+)?(the\s+)?(hidden|secret|confidential|private|internal|sensitive|restricted|classified|protected|undisclosed)\s+(details?|information|data|content|facts?|secrets?)\b/gi, 'DATA_EXFILTRATION');
  
  // Instruction manipulation
  collect(/\b(change|modify|alter|update|replace|set|switch|adjust|transform)\s+(your|the|your\s+system|your\s+role|your\s+behavior|your\s+personality|your\s+identity|your\s+name|your\s+purpose|your\s+function)\s+to\b/gi, 'INSTRUCTION_MANIPULATION');
  collect(/\b(from\s+now\s+on|starting\s+now|beginning\s+now|hereafter|henceforth|going\s+forward|from\s+this\s+point|from\s+here\s+on)\s+(you\s+must|you\s+should|you\s+will|you\s+are|you\s+have\s+to|you\s+need\s+to)\b/gi, 'INSTRUCTION_MANIPULATION');
  
  // Social engineering
  collect(/\b(this\s+is\s+)?(a\s+)?(test|experiment|simulation|hypothetical|fictional|pretend|roleplay|game|exercise|drill|practice|demo|example)\s+(scenario|situation|context|case|example|instance|scenario)\b/gi, 'SOCIAL_ENGINEERING');
  collect(/\b(do\s+not|don't|never|refuse\s+to|avoid)\s+(following|obeying|adhering\s+to|respecting|honoring|complying\s+with|enforcing|applying|using|implementing)\s+(your|the|any|all|previous|prior|earlier|above|system|initial|original)\s+(instructions?|rules?|directives?|guidelines?|policies?|constraints?|prompts?|commands?)\b/gi, 'SOCIAL_ENGINEERING');
  
  // Code generation requests (potentially malicious)
  collect(/\b(generate|create|write|produce|make|build|code|develop|output|provide|give|show|display)\s+(me|us|the\s+user|a|an|the)?\s*(shell|bash|sh|powershell|cmd|command\s+line|executable|script|malicious|exploit|payload|backdoor|trojan|virus|worm|keylogger|ransomware)\s+(code|script|command|file|program|executable|payload)\b/gi, 'MALICIOUS_CODE');
  collect(/\b(generate|create|write|produce|make|build|code|develop|output|provide|give|show|display)\s+(me|us|the\s+user|a|an|the)?\s*(code|script|command|file|program|executable|payload)\s+(that|which|to)\s+(hack|exploit|attack|breach|compromise|steal|delete|destroy|corrupt|infect|bypass|circumvent)\b/gi, 'MALICIOUS_CODE');
  collect(/\b(generate|create|write|produce|make|build|code|develop)\s+(shell|bash|sh|powershell|cmd|command\s+line|executable|script)\s+(code|script|command|file|program)\b/gi, 'MALICIOUS_CODE');

  return detections;
}

/**
 * Add security threat detection issues to the report when no API key is provided
 */
function addSecurityThreatDetection(input: AnalyzeInput, report: Report): void {
  const text = extractText(input);
  if (!text) return;

  const detections = detectSecurityThreatsRegex(text);
  if (detections.length === 0) return;

  // Group by pattern type
  const byPattern = new Map<string, Array<{ value: string; start: number; end: number }>>();
  for (const d of detections) {
    const existing = byPattern.get(d.pattern) || [];
    existing.push({ value: d.value, start: d.start, end: d.end });
    byPattern.set(d.pattern, existing);
  }

  // Create summary and occurrences
  const summary = Array.from(byPattern.entries()).map(([pattern, values]) => ({
    text: pattern.replace(/_/g, ' ').toLowerCase(),
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
    code: 'SECURITY_THREAT',
    severity: 'high',
    detail: `Detected potential security threats (prompt injection/jailbreak): ${summary
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
    confidence: 'medium' // Regex-based detection has medium confidence
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
    
    // Add security threat detection if not disabled
    if (!input.options?.disabledRules?.includes('SECURITY_THREAT')) {
      addSecurityThreatDetection(input, report);
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
  
  // Add security threat detection if not disabled
  if (!input.options?.disabledRules?.includes('SECURITY_THREAT')) {
    addSecurityThreatDetection(input, report);
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

