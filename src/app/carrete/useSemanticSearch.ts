import { useEffect, useRef, useState } from 'react';
import type { LoadedMedia } from './media';
import { loadVideoFrames } from './loadVideoFrames';
import { rankMedia, type SearchMatch } from './semanticSearch';

export type SearchQuery = { text: string } | { image: File };
type SearchState = { busy: boolean; status: string; error: string; label: string; matches: SearchMatch[] | null };
const initial: SearchState = { busy: false, status: '', error: '', label: '', matches: null };

export default function useSemanticSearch(media: LoadedMedia[], source: 'antonio' | 'personal', personal: LoadedMedia[]) {
  const [state, setState] = useState<SearchState>(initial);
  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: number; resolve: (values?: Float32Array) => void; reject: (error: Error) => void } | null>(null);
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const embeddings = useRef(new Map<string, Float32Array>());
  const previousSource = useRef(source);

  function stop() {
    active.current?.abort();
    active.current = null;
    worker.current?.terminate();
    worker.current = null;
    pending.current?.reject(new DOMException('Cancelled', 'AbortError'));
    pending.current = null;
  }

  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (previousSource.current !== source) {
      previousSource.current = source;
      if (active.current) stop();
      setState(initial);
    }
  }, [source]);

  useEffect(() => {
    // Personal vectors are only kept for photos still present in this tab.
    const ids = new Set(personal.map(({ item }) => item.id));
    for (const id of embeddings.current.keys()) if (id.startsWith('personal:') && !ids.has(id)) embeddings.current.delete(id);
  }, [personal]);

  function request(payload: object, transfer: Transferable[] = []) {
    if (!worker.current) {
      const instance = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
      instance.onmessage = ({ data }) => {
        if (data.type === 'progress') {
          setState(current => current.busy ? { ...current, status: `Downloading search · ${Math.round(data.progress)}%` } : current);
        } else if (pending.current && pending.current.id === data.id) {
          const job = pending.current;
          pending.current = null;
          if (data.type === 'error') job.reject(new Error(data.message));
          else job.resolve(data.values);
        }
      };
      instance.onerror = () => {
        pending.current?.reject(new Error('Search could not start. Check your connection and try again.'));
        pending.current = null;
        instance.terminate();
        if (worker.current === instance) worker.current = null;
      };
      worker.current = instance;
    }
    return new Promise<Float32Array | undefined>((resolve, reject) => {
      const id = ++sequence.current;
      pending.current = { id, resolve, reject };
      worker.current!.postMessage({ ...payload, id }, transfer);
    });
  }

  async function search(query: SearchQuery) {
    if (active.current || !media.length || ('text' in query && !query.text.trim())) return false;
    const controller = new AbortController();
    active.current = controller;
    const label = 'text' in query ? query.text.trim() : `Similar to ${query.image.name}`;
    const missing: string[] = [];
    let firstFailure: Error | undefined;
    let queryUrl: string | undefined;
    setState({ ...initial, busy: true, label, status: 'Loading search…' });
    try {
      await request({ type: 'load' });
      controller.signal.throwIfAborted();
      for (let index = 0; index < media.length; index++) {
        const { item } = media[index];
        controller.signal.throwIfAborted();
        setState(current => ({ ...current, status: `Reading your roll · ${index + 1} / ${media.length}` }));
        if (embeddings.current.has(item.id)) continue;
        try {
          let values: Float32Array | undefined;
          if (item.type === 'video') {
            // Six real frames cover the entire film and stay below WebGPU's token budget.
            const frames = await loadVideoFrames(item.src, 6, controller.signal, () => {});
            values = await request({ type: 'video', frames }, [frames.pixels.buffer]);
          } else values = await request({ type: 'image', src: item.src });
          controller.signal.throwIfAborted();
          if (values) embeddings.current.set(item.id, values);
        } catch (error) {
          controller.signal.throwIfAborted();
          // A damaged image should not prevent searching the rest of the roll.
          missing.push(item.id);
          if (!(error instanceof Error)) throw error;
          firstFailure ??= error;
        }
      }
      if (missing.length === media.length) throw firstFailure ?? new Error('Your roll could not be indexed. Check your connection and try again.');
      setState(current => ({ ...current, status: 'Finding matches…' }));
      queryUrl = 'image' in query ? URL.createObjectURL(query.image) : undefined;
      const values = await request(queryUrl ? { type: 'image', src: queryUrl } : { type: 'text', text: label });
      controller.signal.throwIfAborted();
      if (!values) throw new Error('Search returned no embedding. Please try again.');
      const matches = rankMedia(values, embeddings.current, media.map(({ item }) => item.id));
      setState({ busy: false, label, matches, error: '', status: missing.length
        ? `${missing.length} item${missing.length === 1 ? '' : 's'} could not be searched. Try again to retry them.` : '' });
      return true;
    } catch (error) {
      if (!controller.signal.aborted) setState({ ...initial, label, error: error instanceof Error ? error.message : 'Search could not complete. Try again.' });
      return false;
    } finally {
      if (queryUrl) URL.revokeObjectURL(queryUrl);
      if (active.current === controller) active.current = null;
    }
  }

  function clear() { if (active.current) stop(); setState(initial); }
  return { ...state, search, clear };
}
