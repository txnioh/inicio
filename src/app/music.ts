export type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  src: string;
  cover: string;
};

export const audioTracks: readonly AudioTrack[] = [
  { id: 'birds-are-still', title: 'Birds Are Still', artist: 'Takashi Yoshimatsu', album: 'Memo Flora', src: '/music/birds-are-still.mp3', cover: '/yoshimatsu.webp' },
  { id: 'gurre-lieder-prelude', title: 'Gurre-Lieder, Pt. 1: Prelude. Mäßig bewegt', artist: 'Arnold Schoenberg', album: 'Unknown Album', src: '/music/gurre-lieder-prelude.mp3', cover: '/music/cover/gurre-lieder-prelude.webp' },
  { id: 'rukiawaa-track', title: 'ੴঐਁ目ਁ੍覚ਁめৡ੍৾৾એીૐೡૹೖೀ૰௸', artist: 'rukiawaa', album: '௰.̴͐ .᭒̶̄.̵͆悪ୗᔇੴᬼᔇ魔の覚ᬼ.̴͐ .̶̄.̵͆醒ໟଷࡡ', src: '/music/rukiawaa-track.mp3', cover: '/music/cover/rukiawaa-track.webp' },
  { id: 'red-dragonfly', title: 'Red Dragonfly', artist: 'Cho Yong Pil', album: 'Best 2', src: '/music/red-dragonfly.mp3', cover: '/music/cover/red-dragonfly.webp' },
  { id: 'on-the-level', title: 'On the Level', artist: 'Mac DeMarco', album: 'This Old Dog', src: '/music/on-the-level.mp3', cover: '/music/cover/on-the-level.webp' },
  { id: 'funk-machine', title: 'Funk Machine', artist: 'DJANGO', album: 'Funk Machine', src: '/music/funk-machine.mp3', cover: '/music/cover/funk-machine.webp' },
  { id: 'antarctica-echoes-remastered', title: 'Antarctica Echoes - Remastered', artist: 'Vangelis', album: 'Antarctica (Remastered)', src: '/music/antarctica-echoes-remastered.mp3', cover: '/music/cover/antarctica-echoes-remastered.webp' },
];
