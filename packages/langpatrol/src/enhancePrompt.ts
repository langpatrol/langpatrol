/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { analyzePrompt } from './analyzePrompt';
import { redactPII } from './redactPII';
import { optimizePrompt } from './optimizePrompt';
import type { AnalyzeInput, Report, IssueCode } from '@langpatrol/engine';

export interface EnhancePromptConfig {
  /**
   * Enable PII detection and redaction
   * @default false
   */
  enablePIIDetection?: boolean;
  
  /**
   * Enable prompt compression/optimization
   * Requires apiKey to be set
   * @default false
   */
  enableCompression?: boolean;
  
  /**
   * Enable security threat removal
   * If enabled and security threats are detected, malicious parts will be removed
   * @default false
   */
  enableSecurityThreatRemoval?: boolean;
  
  /**
   * API key for cloud services (required)
   * enhancePrompt is a cloud-only feature that requires an API key
   */
  apiKey: string;
  
  /**
   * Base URL for cloud API
   * @default 'http://localhost:3000'
   */
  apiBaseUrl?: string;
  
  /**
   * Additional options to pass to analyzePrompt
   */
  analyzeOptions?: Omit<AnalyzeInput['options'], 'apiKey' | 'apiBaseUrl'>;
}

export interface PIIRecoveryEntry {
  /** Placeholder key like "[EMAIL_1]", "[NAME_1]" */
  key: string;
  /** Original value that was redacted */
  value: string;
}

export interface EnhancePromptSuccess {
  /** The enhanced/optimized prompt */
  optimizedPrompt: string;
  /** All analysis reports generated during enhancement */
  reports: Report[];
  /** 
   * Recovery dictionary for PII redaction (only present if enablePIIDetection is true)
   * Maps placeholder keys to original values, allowing reconstruction of LLM responses
   */
  recoveryDictionary?: PIIRecoveryEntry[];
}

export interface EnhancePromptError {
  error: Error;
  report: Report;
}

type SuccessCallback = (result: EnhancePromptSuccess) => void;
type ErrorCallback = (error: EnhancePromptError) => void;

interface SanitizeResult {
  original_prompt: string;
  sanitized_prompt: string;
  threats_removed: Array<{ type: string; content: string }>;
  was_modified: boolean;
}

/**
 * Sanitize a prompt by removing security threats using the cloud API
 */
async function sanitizePromptCloud(
  prompt: string,
  apiKey: string,
  baseUrl: string
): Promise<SanitizeResult> {
  const url = `${baseUrl}/api/v1/ai-analytics/sanitize`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
    }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<SanitizeResult>;
}

/**
 * Enhances a prompt by:
 * 1. Analyzing it for issues
 * 2. Redacting PII if enabled
 * 3. Compressing if enabled (requires API key)
 * 4. Removing security threats if enabled
 * 
 * Can be used as a Promise or with callbacks:
 * 
 * @example Promise usage:
 * ```ts
 * const result = await enhancePrompt(prompt, config);
 * ```
 * 
 * @example Callback usage:
 * ```ts
 * enhancePrompt(prompt, config, (result) => {
 *   console.log(result.optimizedPrompt);
 * }, (error) => {
 *   console.error(error.error);
 * });
 * ```
 * 
 * @param prompt - The prompt to enhance
 * @param config - Configuration options
 * @param onSuccess - Success callback (optional if using promise)
 * @param onError - Error callback (optional if using promise)
 * @returns Promise if callbacks are not provided, otherwise void
 */
export function enhancePrompt(
  prompt: string,
  config: EnhancePromptConfig
): Promise<EnhancePromptSuccess>;
export function enhancePrompt(
  prompt: string,
  config: EnhancePromptConfig,
  onSuccess: SuccessCallback,
  onError?: ErrorCallback
): void;
export function enhancePrompt(
  prompt: string,
  config: EnhancePromptConfig,
  onSuccess?: SuccessCallback,
  onError?: ErrorCallback
): Promise<EnhancePromptSuccess> | void {
  // Validate API key is provided
  if (!config.apiKey) {
    throw new Error('enhancePrompt requires an API key. Please provide apiKey in the config.');
  }
  const {
    enablePIIDetection = false,
    enableCompression = false,
    enableSecurityThreatRemoval = false,
    apiKey,
    apiBaseUrl,
    analyzeOptions,
  } = config;

  const reports: Report[] = [];
  let currentPrompt = prompt;
  let recoveryDictionary: PIIRecoveryEntry[] | undefined;

  // Helper to handle errors
  const handleError = (error: Error, report?: Report): never => {
    const errorResult: EnhancePromptError = {
      error,
      report: report || { issues: [] },
    };
    
    if (onError) {
      onError(errorResult);
      // Return undefined when using callbacks (void return)
      return undefined as never;
    } else {
      throw errorResult;
    }
  };

  // Main processing function
  const process = async (): Promise<EnhancePromptSuccess> => {
    try {
      // Step 1: Analyze the prompt
      const analyzeInput: AnalyzeInput = {
        prompt: currentPrompt,
        options: {
          ...analyzeOptions,
          apiKey,
          apiBaseUrl,
        },
      };

      const analysisReport = await analyzePrompt(analyzeInput);
      reports.push(analysisReport);

      // Check for errors that should stop processing
      const hasOutOfContext = analysisReport.issues.some(
        (issue) => issue.code === 'OUT_OF_CONTEXT'
      );

      if (hasOutOfContext) {
        const error = new Error('Prompt is out of context');
        return handleError(error, analysisReport);
      }

      // Step 2: Redact PII if enabled
      if (enablePIIDetection) {
        try {
          const redactionResult = await redactPII({
            prompt: currentPrompt,
            options: {
              apiKey,
              apiBaseUrl,
            },
          });

          currentPrompt = redactionResult.redacted_prompt;
          
          // Store recovery dictionary for later use
          if (redactionResult.detection && redactionResult.detection.length > 0) {
            recoveryDictionary = redactionResult.detection.map((d) => ({
              key: d.key,
              value: d.value,
            }));
          }
          
          // Create a report for PII redaction
          const redactionReport: Report = {
            issues: [
              {
                id: `pii-redaction-${Date.now()}`,
                code: 'PII_DETECTED',
                severity: 'medium',
                detail: `Redacted ${redactionResult.detection.length} PII items`,
                evidence: {
                  summary: redactionResult.detection.map((d) => ({
                    text: d.key,
                    count: 1,
                  })),
                  occurrences: redactionResult.detection.map((d) => ({
                    text: d.value,
                    start: 0, // PII positions are not tracked in redaction result
                    end: d.value.length,
                  })),
                },
                scope: { type: 'prompt' },
                confidence: 'high',
              },
            ],
          };
          reports.push(redactionReport);
        } catch (error) {
          // If PII redaction fails, continue with original prompt
          console.warn('PII redaction failed:', error);
        }
      }

      // Step 3: Remove security threats if enabled (requires API key for proper sanitization)
      if (enableSecurityThreatRemoval) {
        const securityThreats = analysisReport.issues.filter(
          (issue) => issue.code === ('SECURITY_THREAT' as IssueCode)
        );

        if (securityThreats.length > 0) {
          if (apiKey) {
            // Use cloud API for proper AI-powered sanitization
            try {
              const sanitizeResult = await sanitizePromptCloud(
                currentPrompt,
                apiKey,
                apiBaseUrl || 'http://localhost:3000'
              );
              
              if (sanitizeResult.was_modified) {
                currentPrompt = sanitizeResult.sanitized_prompt;
                
                // Create a report for security threat removal
                const removalReport: Report = {
                  issues: [
                    {
                      id: `security-removal-${Date.now()}`,
                      code: 'SECURITY_THREAT' as IssueCode,
                      severity: 'high',
                      detail: `Removed ${sanitizeResult.threats_removed.length} security threat(s): ${sanitizeResult.threats_removed.map(t => t.type).join(', ')}`,
                      evidence: {
                        summary: sanitizeResult.threats_removed.map((t) => ({
                          text: `${t.type}: ${t.content.substring(0, 50)}${t.content.length > 50 ? '...' : ''}`,
                          count: 1,
                        })),
                      },
                      scope: { type: 'prompt' },
                      confidence: 'high',
                    },
                  ],
                };
                reports.push(removalReport);
              }
            } catch (error) {
              console.warn('Prompt sanitization failed:', error);
              // Continue without sanitization if it fails
            }
          } else {
            // Without API key, we can only warn about security threats
            console.warn('Security threats detected but API key required for sanitization');
            const warningReport: Report = {
              issues: [
                {
                  id: `security-warning-${Date.now()}`,
                  code: 'SECURITY_THREAT' as IssueCode,
                  severity: 'high',
                  detail: `Detected ${securityThreats.length} security threat(s) - API key required for removal`,
                  evidence: {
                    summary: securityThreats.map((issue) => ({
                      text: issue.detail || 'Security threat',
                      count: 1,
                    })),
                  },
                  scope: { type: 'prompt' },
                  confidence: 'high',
                },
              ],
            };
            reports.push(warningReport);
          }
        }
      }

      // Step 4: Compress prompt if enabled (requires API key)
      if (enableCompression) {
        if (!apiKey) {
          const error = new Error('Compression requires an API key');
          return handleError(error, analysisReport);
        }

        try {
          const compressionResult = await optimizePrompt({
            prompt: currentPrompt,
            options: {
              apiKey,
              apiBaseUrl,
            },
          });

          currentPrompt = compressionResult.optimized_prompt;
          
          // Create a report for compression
          const compressionReport: Report = {
            issues: [],
            meta: {
              latencyMs: 0,
            },
          };
          // Store compression info in a custom way (meta doesn't support these fields)
          // You can access compressionResult directly if needed
          reports.push(compressionReport);
        } catch (error) {
          // If compression fails, continue with current prompt
          console.warn('Prompt compression failed:', error);
        }
      }

      return {
        optimizedPrompt: currentPrompt,
        reports,
        recoveryDictionary,
      };
    } catch (error) {
      if (error instanceof Error) {
        handleError(error, reports[reports.length - 1]);
        throw error;
      }
      throw error;
    }
  };

  // If callbacks are provided, run asynchronously and call them
  if (onSuccess || onError) {
    process()
      .then((result) => {
        if (onSuccess) {
          onSuccess(result);
        }
      })
      .catch((error) => {
        if (onError) {
          onError({
            error: error instanceof Error ? error : new Error(String(error)),
            report: reports[reports.length - 1] || { issues: [] },
          });
        }
      });
    return; // Return void when using callbacks
  }

  // Otherwise return a promise
  return process();
}

