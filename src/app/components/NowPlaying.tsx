import { useGlobalAudioPlayer } from './GlobalAudioPlayer';
import PlayerIcon from './PlayerIcon';

export default function NowPlaying({ lang = 'en' }: { lang?: 'en' | 'es' }) {
  const { activeTrack, activeTrackIndex, error, isPlaying, loadState, selectTrack, togglePlayback, tracks } = useGlobalAudioPlayer();
  if (loadState === 'idle') return null;

  const spanish = lang === 'es';
  const playbackLabel = isPlaying ? (spanish ? 'Pausar' : 'Pause') : (spanish ? 'Reproducir' : 'Play');
  const nextLabel = spanish ? 'Siguiente canción' : 'Next track';
  const status = error ? (spanish ? 'No se pudo reproducir. Vuelve a pulsar play.' : error)
    : loadState === 'loading' ? (spanish ? 'Cargando…' : 'Loading…')
    : isPlaying ? (spanish ? 'Sonando' : 'Playing') : (spanish ? 'En pausa' : 'Paused');

  return (
    <section className="minimal-now-playing" aria-label={spanish ? 'Reproductor de música' : 'Music player'} lang={lang}>
      <img src={activeTrack.cover.replace('.webp', '-144.webp')} width="28" height="28" alt="" draggable={false} />
      <p className={`minimal-now-playing-track${error ? ' is-error' : ''}`} title={error ? status : `${activeTrack.title} — ${activeTrack.artist}`}>
        {error ? status : <><strong>{activeTrack.title}</strong><span> — {activeTrack.artist}</span></>}
      </p>
      <span className="minimal-hidden-nav" role="status">{status}: {activeTrack.title} — {activeTrack.artist}</span>
      <button type="button" onClick={togglePlayback} aria-label={`${playbackLabel} ${activeTrack.title}`} title={playbackLabel} aria-busy={loadState === 'loading'}>
        {loadState === 'loading' && !isPlaying ? '···' : <PlayerIcon name={isPlaying ? 'pause' : 'play'} />}
      </button>
      <button type="button" onClick={() => selectTrack((activeTrackIndex + 1) % tracks.length)} aria-label={nextLabel} title={nextLabel}>
        <PlayerIcon name="next" />
      </button>
    </section>
  );
}
