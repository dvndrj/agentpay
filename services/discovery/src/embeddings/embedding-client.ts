/**
 * EmbeddingClient interface (ADR-1 scaffolding, Task 20.1).
 *
 * Abstracted behind this interface so the Discovery_Service can be
 * tested with a deterministic fake and deployed with a real model
 * (Sentence-Transformers, OpenAI, Voyage, etc.).
 *
 * All implementations return a 384-dimension Float32Array,
 * matching the pgvector vector(384) column.
 */

/**
 * Embedding function: text → 384-dim vector.
 */
export interface EmbeddingClient {
  /** Compute the embedding vector for a given text. */
  embed(text: string): Promise<Float32Array>;
}

// ── Deterministic Fake for Testing ──────────────────────────────

/**
 * A deterministic fake embedding client for tests.
 *
 * Produces a pseudo-random but reproducible 384-dim vector from
 * the input text using a simple hash function. Not meaningful
 * for real cosine similarity, but perfect for PBTs (P3, P4).
 */
export class FakeEmbeddingClient implements EmbeddingClient {
  async embed(text: string): Promise<Float32Array> {
    const vec = new Float32Array(384);
    // Simple deterministic hash: seed a LCG-ish state from the text
    let state = this.hashText(text);

    for (let i = 0; i < 384; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      // Map to [-1, 1]
      vec[i] = (state / 0x7fffffff) * 2 - 1;
    }

    return vec;
  }

  private hashText(text: string): number {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }
}
