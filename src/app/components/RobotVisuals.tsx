export function SpeechLetters({ text, letterDelay = 24, elapsed }: { text: string; letterDelay?: number; elapsed?: number }) {
  let letterIndex = 0;
  return text.split(/(\s+)/).map((word, wordIndex) => /^\s+$/.test(word) ? word : (
    <span className="minimal-robot-word" key={wordIndex}>
      {Array.from(word).map(letter => {
        const index = letterIndex++;
        const progress = elapsed === undefined ? null : Math.max(0, Math.min(1, (elapsed - index * letterDelay) / 240));
        return <span className="minimal-robot-letter" key={index} style={progress === null
          ? { animationDelay: `${index * letterDelay}ms` }
          : { animation: 'none', opacity: progress, filter: `blur(${3 * (1 - progress)}px)`, transform: `translateY(${2 * (1 - progress)}px)` }}>{letter}</span>;
      })}
    </span>
  ));
}

export function RobotEffects({ mode }: { mode: string }) {
  if (mode === 'sleeping') return <span className="minimal-robot-effects robot-sleep" aria-hidden="true">
    <i className="robot-sleep-halo" />
    <span>z</span><span>z</span><span>Z</span>
  </span>;
  if (mode === 'music') return <span className="minimal-robot-effects robot-music" aria-hidden="true">
    <i className="robot-music-ring" />
    <span>♪</span><span>♫</span><span>✦</span><span>♪</span>
  </span>;
  if (mode === 'carried') return <span className="minimal-robot-effects robot-sweat" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map(index => <svg key={index} viewBox="0 0 8 12">
      <path d="M4 .5C3 3 0 6 0 8a4 4 0 0 0 8 0C8 6 5 3 4 .5Z" />
    </svg>)}
  </span>;
  return null;
}

export function RobotFace() {
  return (
    <svg viewBox="0 0 48 36" focusable="false" aria-hidden="true">
      <g className="minimal-robot-head-follow">
        <g className="minimal-robot-expression">
          <rect className="minimal-robot-shell" x="7" y="8" width="34" height="23" rx="10" />
          <rect className="minimal-robot-screen" x="12" y="12" width="24" height="14" rx="6" />
          <g className="minimal-robot-eyes">
            <g className="minimal-robot-blink">
              <rect x="18" y="16" width="3.6" height="6.8" rx="1.8" />
              <rect x="26.4" y="16" width="3.6" height="6.8" rx="1.8" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
