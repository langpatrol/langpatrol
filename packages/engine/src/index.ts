/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

export { analyze } from './analyze';
export * from './types';

// Internal exports for advanced usage (semantic similarity and NLI features)
export { runAsync as runReferenceAsync } from './rules/reference';
export { runAsync as runConflictsAsync } from './rules/conflicts';
export { isSemanticSimilarityAvailable } from './util/semanticSimilarity';
export { isNLIEntailmentAvailable } from './util/nliEntailment';
export { checkFulfillmentCombined } from './util/fulfillmentChecker';
export { isNLPExtractionAvailable } from './util/nlpExtract';

