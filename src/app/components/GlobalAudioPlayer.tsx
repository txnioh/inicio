'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { audioTracks, type AudioTrack } from '../music';

type AudioLoadState = 'idle' | 'loading' | 'ready' | 'error';

interface GlobalAudioPlayerContextValue {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isReady: boolean;
  loadState: AudioLoadState;
  bufferedPercent: number;
  error: string | null;
  tracks: readonly AudioTrack[];
  activeTrack: AudioTrack;
  activeTrackIndex: number;
  togglePlayback: () => void;
  seekTo: (seconds: number) => void;
  selectTrack: (index: number) => void;
}

const GlobalAudioPlayerContext = createContext<GlobalAudioPlayerContextValue | null>(null);

function getBufferedPercent(audio: HTMLAudioElement) {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.buffered.length === 0) {
    return 0;
  }

  let bufferedEnd = 0;
  for (let index = 0; index < audio.buffered.length; index += 1) {
    bufferedEnd = Math.max(bufferedEnd, audio.buffered.end(index));
  }

  return Math.min((bufferedEnd / audio.duration) * 100, 100);
}

export function GlobalAudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeTrackIndexRef = useRef(0);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadState, setLoadState] = useState<AudioLoadState>('idle');
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const activeTrack = audioTracks[activeTrackIndex] ?? audioTracks[0];

  const updateBuffered = useCallback((audio: HTMLAudioElement) => {
    setBufferedPercent(getBufferedPercent(audio));
  }, []);

  const loadTrack = useCallback((index: number, autoplay: boolean) => {
    const track = audioTracks[index];
    const audio = audioRef.current;
    if (!track || !audio) return;

    activeTrackIndexRef.current = index;
    setActiveTrackIndex(index);
    setCurrentTime(0);
    setDuration(0);
    setBufferedPercent(0);
    setError(null);
    setLoadState('loading');

    audio.pause();
    audio.src = track.src;
    audio.load();

    if (autoplay) {
      void audio.play().catch(() => {
        setIsPlaying(false);
        setLoadState('error');
        setError('Playback could not start. Try pressing play again.');
      });
    }
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleLoadStart = () => {
      setLoadState('loading');
      setError(null);
    };
    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setCurrentTime(audio.currentTime);
      updateBuffered(audio);
    };
    const handleCanPlay = () => {
      setLoadState('ready');
      updateBuffered(audio);
    };
    const handleProgress = () => updateBuffered(audio);
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      updateBuffered(audio);
    };
    const handlePlaying = () => {
      setIsPlaying(true);
      setLoadState('ready');
    };
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => {
      if (!audio.paused) setLoadState('loading');
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration);
    };
    const handleError = () => {
      setIsPlaying(false);
      setLoadState('error');
      setError('This track could not be loaded.');
    };

    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('progress', handleProgress);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('stalled', handleWaiting);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    loadTrack(0, false);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('progress', handleProgress);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('stalled', handleWaiting);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audioRef.current = null;
    };
  }, [loadTrack, updateBuffered]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      setLoadState('loading');
      setError(null);
      void audio.play().catch(() => {
        setIsPlaying(false);
        setLoadState('error');
        setError('Playback could not start. Try pressing play again.');
      });
      return;
    }

    audio.pause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;

    audio.currentTime = Math.min(Math.max(seconds, 0), audio.duration);
    setCurrentTime(audio.currentTime);
  }, []);

  const selectTrack = useCallback((index: number) => {
    if (!audioTracks[index]) return;

    const audio = audioRef.current;
    if (index === activeTrackIndexRef.current && audio) {
      if (audio.paused) {
        setLoadState('loading');
        setError(null);
        void audio.play().catch(() => {
          setLoadState('error');
          setError('Playback could not start. Try pressing play again.');
        });
      }
      return;
    }

    loadTrack(index, true);
  }, [loadTrack]);

  const contextValue = useMemo(() => ({
    isPlaying,
    currentTime,
    duration,
    isReady: Number.isFinite(duration) && duration > 0,
    loadState,
    bufferedPercent,
    error,
    tracks: audioTracks,
    activeTrack,
    activeTrackIndex,
    togglePlayback,
    seekTo,
    selectTrack,
  }), [
    activeTrack,
    activeTrackIndex,
    bufferedPercent,
    currentTime,
    duration,
    error,
    isPlaying,
    loadState,
    seekTo,
    selectTrack,
    togglePlayback,
  ]);

  return (
    <GlobalAudioPlayerContext.Provider value={contextValue}>
      {children}
    </GlobalAudioPlayerContext.Provider>
  );
}

export function useGlobalAudioPlayer() {
  const context = useContext(GlobalAudioPlayerContext);
  if (!context) {
    throw new Error('useGlobalAudioPlayer must be used within GlobalAudioPlayerProvider');
  }
  return context;
}
