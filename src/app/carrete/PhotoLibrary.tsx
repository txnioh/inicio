import { useRef, useState } from 'react';
import type usePersonalPhotos from './usePersonalPhotos';
import { PHOTO_LIMIT } from './usePersonalPhotos';

export default function PhotoLibrary({ personal, source, onSource, onImport, onClear }: {
  personal: ReturnType<typeof usePersonalPhotos>;
  source: 'antonio' | 'personal';
  onSource: (source: 'antonio' | 'personal') => void;
  onImport: (files: File[]) => Promise<void>;
  onClear: () => void;
}) {
  const photos = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = personal.progress !== null;
  const hasPhotos = personal.media.length > 0;
  const canChooseFolder = 'webkitdirectory' in document.createElement('input');
  const select = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    void onImport(files);
  };

  return <section id="carrete-library" popover="auto" role="dialog" className="carrete-library" aria-labelledby="carrete-library-title">
    <div className="carrete-library-heading">
      <h2 id="carrete-library-title">Make yourself at home.</h2>
      <button type="button" className="carrete-text-button" popoverTarget="carrete-library" popoverTargetAction="hide" aria-label="Close photo library">×</button>
    </div>
    <p>Carrete is Antonio’s photo journal. You can explore your own photos here, too.</p>
    {hasPhotos && <div className="carrete-library-sources" role="group" aria-label="Photo collection">
      <button type="button" aria-pressed={source === 'antonio'} onClick={() => onSource('antonio')}>Antonio’s</button>
      <button type="button" aria-pressed={source === 'personal'} onClick={() => onSource('personal')}>Yours · {personal.media.length}</button>
    </div>}
    <div className={`carrete-library-drop${dragging ? ' is-dragover' : ''}`}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; setDragging(!busy); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) void onImport(Array.from(event.dataTransfer.files)); }}>
      <button type="button" className="carrete-library-pick" disabled={busy} onClick={() => photos.current?.click()}>
        {busy ? `Opening ${personal.progress!.done} / ${personal.progress!.total}…` : hasPhotos ? 'Add photos' : 'Choose photos'}
      </button>
      <span>From your photo library or files</span>
      {canChooseFolder && <button type="button" className="minimal-basic-link carrete-text-button" disabled={busy} onClick={() => folder.current?.click()}>Choose a folder</button>}
      <small>Or drop photos here · up to {PHOTO_LIMIT}</small>
    </div>
    <input ref={photos} type="file" multiple accept="image/*" hidden aria-label="Choose personal photos" onChange={event => select(event.currentTarget)} />
    <input ref={folder} type="file" multiple accept="image/*" hidden aria-label="Choose photo folder"
      {...{ webkitdirectory: '' }} onChange={event => select(event.currentTarget)} />
    <p className="carrete-library-privacy">Only you see these photos. They stay in this tab and disappear when you reload or leave Carrete.</p>
    <p className="carrete-library-status" role="status" aria-live="polite">{busy
      ? `${personal.progress!.done} of ${personal.progress!.total} photos processed.` : personal.message}</p>
    {hasPhotos && <button type="button" className="minimal-basic-link carrete-text-button" disabled={busy} onClick={onClear}>Clear your photos</button>}
  </section>;
}
