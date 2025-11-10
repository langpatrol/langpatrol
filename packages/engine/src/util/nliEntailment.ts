/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0
import path from "path";
import { fileURLToPath } from "url";
import { pipeline } from '@xenova/transformers';

let nliPipeline: any = null;

// function load our distilbert model.
export async function loadNLIModel() {
  if (!nliPipeline) {
    // Use __dirname directly in CommonJS builds
    const modelPath = path.resolve(__dirname, "../models/distilbert-base-uncased-mnli");

    nliPipeline = await pipeline("text-classification", modelPath, {
      quantized: true,
    });
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
  const nli = await loadNLIModel();
  const result = await nli(`${premise} [SEP] ${hypothesis}`);

  const entailment = result.find((r: any) => r.label === "ENTAILMENT");
  return entailment ? entailment.score : null;
}

/**
 * Check if NLI entailment is enabled/available
 */
export function isNLIEntailmentAvailable(): boolean {
  return pipeline !== null;
}

