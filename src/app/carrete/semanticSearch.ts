export const EMBEDDING_DIMENSIONS = 768;
export type SearchMatch = { id: string; score: number };

export function normalizeEmbedding(values: Float32Array) {
  if (values.length !== EMBEDDING_DIMENSIONS) throw new Error('Invalid search embedding.');
  let length = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error('Invalid search embedding.');
    length += value * value;
  }
  if (!length) throw new Error('Empty search embedding.');
  length = Math.sqrt(length);
  return values.map(value => value / length);
}

// Both query and media vectors are normalized, so their dot product is cosine similarity.
export function rankMedia(query: Float32Array, embeddings: ReadonlyMap<string, Float32Array>, ids: string[]) {
  const matches: SearchMatch[] = [];
  for (const id of ids) {
    const embedding = embeddings.get(id);
    if (!embedding) continue;
    let score = 0;
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) score += query[i] * embedding[i];
    // Same relevance floor as the reference demo; unrelated items can return no matches.
    if (score >= .65) matches.push({ id, score });
  }
  return matches.sort((a, b) => b.score - a.score);
}
