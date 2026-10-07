import { useRef, useState } from 'react';
import type useSemanticSearch from './useSemanticSearch';
import type { SearchQuery } from './useSemanticSearch';

export default function SearchRoll({ search, canSearch, onResults }: {
  search: ReturnType<typeof useSemanticSearch>;
  canSearch: boolean;
  onResults: () => void;
}) {
  const [text, setText] = useState('');
  const panel = useRef<HTMLElement>(null);
  const image = useRef<HTMLInputElement>(null);
  async function submit(query: SearchQuery) {
    if (await search.search(query)) {
      panel.current?.hidePopover();
      onResults();
    }
  }

  return <section ref={panel} id="carrete-search" popover="auto" role="dialog" className="carrete-library carrete-search" aria-labelledby="carrete-search-title">
    <div className="carrete-library-heading">
      <h2 id="carrete-search-title">Find a moment.</h2>
      <button type="button" className="carrete-text-button" popoverTarget="carrete-search" popoverTargetAction="hide" aria-label="Close search">×</button>
    </div>
    <p>Describe what you remember, or find moments that look like a photo.</p>
    <form onSubmit={event => { event.preventDefault(); void submit({ text }); }}>
      <label className="carrete-sr-only" htmlFor="carrete-search-query">Describe a photo or video</label>
      <input id="carrete-search-query" type="search" placeholder="Mar, atardeceres, una ciudad de noche…" value={text}
        maxLength={500} onChange={event => setText(event.target.value)} disabled={search.busy} autoComplete="off" />
      <button type="submit" className="carrete-library-pick" disabled={!canSearch || search.busy || !text.trim()}>Search</button>
    </form>
    <button type="button" className="minimal-basic-link carrete-text-button" disabled={!canSearch || search.busy} onClick={() => image.current?.click()}>Search with a photo</button>
    <input ref={image} type="file" accept="image/*" hidden aria-label="Choose a search photo" onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (file) void submit({ image: file });
    }} />
    <p className="carrete-library-privacy">Search runs on your device. The first search downloads the model (about 284 MB); your photos and searches stay here. Requires WebGPU.</p>
    <p className="carrete-library-status" role="status" aria-live="polite">{search.busy ? search.status : search.error || search.status}</p>
    {search.busy && <button type="button" className="minimal-basic-link carrete-text-button" onClick={search.clear}>Cancel search</button>}
    {!canSearch && <p className="carrete-library-status">Your roll will be ready to search once its photos have loaded.</p>}
  </section>;
}
