/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0
import { FeatureExtractionPipeline, pipeline } from '@xenova/transformers';

// Lazy-load the embedding model
let embeddingPipeline: FeatureExtractionPipeline | null = null;


async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    // Load the MiniLM-L6-v2 model for embeddings
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      {
        quantized: true, // Use quantized model for smaller size
      }
    );
  }
  return embeddingPipeline;
}


/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }
  
  return dotProduct / denominator;
}

/**
 * Semantic similarity scoring using MiniLM-L6-v2 embeddings.
 * 
 * @param text1 First text to compare
 * @param text2 Second text to compare
 * @returns Similarity score between 0 and 1, or null if not available
 */
export async function computeSemanticSimilarity(
  text1: string,
  text2: string
): Promise<number | null> {
  try {
    if (!text1 || !text2) {
      return null;
    }
    
    const pipeline = await getEmbeddingPipeline();
    
    // Compute embeddings for both texts
    const [embedding1, embedding2] = await Promise.all([
      pipeline(text1, { pooling: 'mean', normalize: true }),
      pipeline(text2, { pooling: 'mean', normalize: true }),
    ]);
    
    // Extract the embedding vectors
    const vec1 = Array.from(embedding1.data);
    const vec2 = Array.from(embedding2.data);
    
    // Calculate cosine similarity
    const similarity = cosineSimilarity(vec1, vec2);
    
    // Normalize to 0-1 range (cosine similarity is already -1 to 1, but embeddings are normalized)
    // For normalized embeddings, cosine similarity should already be in 0-1 range
    return Math.max(0, Math.min(1, similarity));
  } catch (error) {
    console.error('Error computing semantic similarity:', error);
    return null;
  }
}

/**
 * Check if semantic similarity is enabled/available
 */
export function isSemanticSimilarityAvailable(): boolean {
  return embeddingPipeline !== null;
}