import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeEmbedding, rankMedia, EMBEDDING_DIMENSIONS } from '../src/app/carrete/semanticSearch.ts';

const vector = (x, y = 0) => {
  const values = new Float32Array(EMBEDDING_DIMENSIONS);
  values[0] = x;
  values[1] = y;
  return normalizeEmbedding(values);
};

test('cosine search ranks matching media and excludes unrelated content', () => {
  const embeddings = new Map([['sea', vector(1)], ['coast', vector(.8, .6)], ['city', vector(0, 1)]]);
  const matches = rankMedia(vector(2), embeddings, ['city', 'coast', 'sea']);
  assert.deepEqual(matches.map(match => match.id), ['sea', 'coast']);
  assert.equal(matches[0].score, 1);
});

test('search respects the current library, missing items and empty results', () => {
  const embeddings = new Map([['antonio', vector(1)], ['personal', vector(0, 1)]]);
  assert.deepEqual(rankMedia(vector(1), embeddings, ['personal', 'missing']), []);
  assert.deepEqual(rankMedia(vector(1), embeddings, []), []);
  assert.deepEqual(rankMedia(vector(0, 1), embeddings, ['personal']).map(match => match.id), ['personal']);
});

test('invalid embeddings fail instead of returning plausible rankings', () => {
  assert.throws(() => normalizeEmbedding(new Float32Array(10)));
  assert.throws(() => normalizeEmbedding(new Float32Array(EMBEDDING_DIMENSIONS)));
  const invalid = new Float32Array(EMBEDDING_DIMENSIONS); invalid[0] = NaN;
  assert.throws(() => normalizeEmbedding(invalid));
});
