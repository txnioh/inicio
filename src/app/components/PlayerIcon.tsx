export default function PlayerIcon({ name }: { name: 'previous' | 'next' | 'play' | 'pause' | 'expand' | 'collapse' | 'back' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'previous' && <><path d="M11.5 3.5 5.5 8l6 4.5Z" fill="currentColor" stroke="none" /><path d="M4 4v8" /></>}
      {name === 'next' && <><path d="m4.5 3.5 6 4.5-6 4.5Z" fill="currentColor" stroke="none" /><path d="M12 4v8" /></>}
      {name === 'play' && <path d="m5 3 7 5-7 5Z" fill="currentColor" stroke="none" />}
      {name === 'pause' && <><path d="M5.5 4v8M10.5 4v8" strokeWidth="2.5" /></>}
      {name === 'expand' && <path d="M9.5 2.5h4v4m0-4L9 7M6.5 13.5h-4v-4m0 4L7 9" />}
      {name === 'collapse' && <path d="M13.5 2.5 9 7m0-4v4h4M2.5 13.5 7 9m-4 0h4v4" />}
      {name === 'back' && <path d="m7 3-5 5 5 5M2 8h12" />}
    </svg>
  );
}
