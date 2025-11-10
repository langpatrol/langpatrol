/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0
import { pipeline, ZeroShotClassificationPipeline } from '@xenova/transformers';

// Lazy-load the NLI model
let nliPipeline: ZeroShotClassificationPipeline|null = null;

async function getNLIPipeline(): Promise<ZeroShotClassificationPipeline> {
  if (!nliPipeline) {
    // Load the distilbert-base-uncased-mnli model for NLI
    // Using zero-shot-classification task which is appropriate for NLI
    nliPipeline = await pipeline(
      'zero-shot-classification',
      'Xenova/distilbert-base-uncased-mnli',
      {
        quantized: true, // Use quantized model for smaller size
      }
    );
  }
  return nliPipeline;
}
/**
 * NLI (Natural Language Inference) entailment validation using distilbert-base-uncased-mnli.
 * 
 * 2. Load the distilbert-base-uncased-mnli ONNX model
 * 3. Tokenize premise and hypothesis
 * 4. Run inference
 * 5. Return entailment score
 * 
 * @param premise The premise text (e.g., "The report contains sales data")
 * @param hypothesis The hypothesis text (e.g., "There is a report")
 * @returns Entailment score between 0 and 1, or null if not available
 */
export async function checkEntailment(premise: string, hypothesis: string): Promise<number | null> {
  try {
    if (!premise || !hypothesis) {
      console.log('[NLI] Skipping: empty premise or hypothesis');
      return null;
    }
    
    console.log('[NLI] Checking entailment - Premise:', premise.substring(0, 50), 'Hypothesis:', hypothesis.substring(0, 50));
    console.log('[NLI] Loading model...');
    const pipeline = await getNLIPipeline();
    console.log('[NLI] Model loaded, running inference...');
    
    // For zero-shot-classification, we use the premise as the sequence to classify
    // and the hypothesis as a candidate label
    // The model will return scores for how well the premise entails the hypothesis
    const result = await pipeline(premise, [hypothesis]);
    console.log('[NLI] Inference result:', JSON.stringify(result, null, 2));

    // The result should have scores array with the hypothesis score
    // Higher score = more likely to be entailed
    if (result && result.scores && result.scores.length > 0) {
      const score = result.scores[0]; // Score for the hypothesis
      console.log('[NLI] Entailment score:', score);
      return Math.max(0, Math.min(1, score));
    }
    
    console.log('[NLI] No score found in result');
    return null;
  } catch (error) {
    console.error('[NLI] Error checking entailment:', error);
    return null;
  }
}

/**
 * Check if NLI entailment is enabled/available
 * Note: Models are lazy-loaded, so this returns true if the library is available
 * The actual model will be loaded on first use
 */
export function isNLIEntailmentAvailable(): boolean {
  // Always return true - model will be loaded lazily on first use
  // This allows the system to attempt loading even if not pre-loaded
  return true;
}

