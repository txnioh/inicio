export type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  src: string;
  cover: string;
  color: string;
  duration: number;
};

export const audioTracks: readonly AudioTrack[] = [
  { id: 'birds-are-still', title: 'Birds Are Still', artist: 'Takashi Yoshimatsu', album: 'Memo Flora', src: '/music/birds-are-still.mp3', cover: '/music/cover/optimized/yoshimatsu.webp', color: 'rgb(205, 118, 56)', duration: 113.429 },
  { id: 'gurre-lieder-prelude', title: 'Gurre-Lieder, Pt. 1: Prelude. Mäßig bewegt', artist: 'Arnold Schoenberg', album: 'Unknown Album', src: '/music/gurre-lieder-prelude.mp3', cover: '/music/cover/optimized/gurre-lieder-prelude.webp', color: 'rgb(45, 54, 73)', duration: 483.496 },
  { id: 'rukiawaa-track', title: 'ੴঐਁ目ਁ੍覚ਁめৡ੍৾৾એીૐೡૹೖೀ૰௸', artist: 'rukiawaa', album: '௰.̴͐ .᭒̶̄.̵͆悪ୗᔇੴᬼᔇ魔の覚ᬼ.̴͐ .̶̄.̵͆醒ໟଷࡡ', src: '/music/rukiawaa-track.mp3', cover: '/music/cover/optimized/rukiawaa-track.webp', color: 'rgb(100, 80, 110)', duration: 84.136 },
  { id: 'red-dragonfly', title: 'Red Dragonfly', artist: 'Cho Yong Pil', album: 'Best 2', src: '/music/red-dragonfly.mp3', cover: '/music/cover/optimized/red-dragonfly.webp', color: 'rgb(170, 161, 139)', duration: 330.453 },
  { id: 'on-the-level', title: 'On the Level', artist: 'Mac DeMarco', album: 'This Old Dog', src: '/music/on-the-level.mp3', cover: '/music/cover/optimized/on-the-level.webp', color: 'rgb(208, 195, 111)', duration: 227.659 },
  { id: 'funk-machine', title: 'Funk Machine', artist: 'DJANGO', album: 'Funk Machine', src: '/music/funk-machine.mp3', cover: '/music/cover/optimized/funk-machine.webp', color: 'rgb(86, 6, 6)', duration: 323.232 },
  { id: 'antarctica-echoes-remastered', title: 'Antarctica Echoes - Remastered', artist: 'Vangelis', album: 'Antarctica (Remastered)', src: '/music/antarctica-echoes-remastered.mp3', cover: '/music/cover/optimized/antarctica-echoes-remastered.webp', color: 'rgb(224, 230, 240)', duration: 352.396 },
];
