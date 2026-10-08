// Jumper's words, in English (the default) and Chinese. The choice is kept
// per browser and follows Jumper into the runs.

export type Lang = 'en' | 'zh';
export const langs: { id: Lang; name: string }[] = [{ id: 'en', name: 'EN' }, { id: 'zh', name: '中文' }];

export const strings = {
  en: {
    canvas: 'Jumper playground. WASD: walk. J/L: turn. Space: jump. R: reset.',
    section: 'Section', settings: 'Settings', retry: 'Retry', loading: 'Loading',
    loadingRobot: 'Loading Jumper', loadingRun: 'Preparing the run',
    loadFailed: 'Could not load.', noWebgl: 'WebGL is not available.',
    action: 'Action', stopped: 'Stopped', preparing: 'Preparing', colour: 'Colour', language: 'Language',
    grid: 'Grid', collisions: 'Collisions', camera: 'Camera', front: 'Front', top: 'Top',
    contacts: 'contacts', evaSkin: 'EVA-01 · a look over Jumper',
    provenance: ['Original policies · MuJoCo', 'Simulation, not calibrated on hardware'], simulator: 'Simulator',
    start: 'Start', pilot: 'Pilot', pilotOn: 'Pilot on', pause: 'Pause', play: 'Play', reset: 'Reset',
    back: 'Back to the playground', jump: 'Jump', move: 'Move Jumper',
    hintSkate: 'Enter release · ←/→ turn · W/S weight · P pilot · R reset',
    hintJumper: 'WASD · J/L · Space · Enter on a sign: ride',
    pilotTag: 'pilot', again: 'Again', clean: 'No cone touched', top_: 'top',
    cones: (n: number) => `${n} ${n === 1 ? 'cone' : 'cones'} down`,
    maps: { calle: ['Street', 'Skate'], costa: ['Coast', 'Longboard'], minimal: ['Coast minimal', 'Longboard'] },
    motions: {
      locomotion: 'Walk', jump: 'Jump', gesture_hello: 'Hello', gesture_bow: 'Bow', gesture_paw: 'Give paw', gesture_salute: 'Salute',
      dance_maze: 'Maze dance', dance_brazilian: 'Brazilian dance', dance_crab: 'Crab dance', dance_dream_wings: 'Dream Wings',
      claw_left: 'Left claw', claw_right: 'Right claw',
    },
    skins: { original: 'Original', sand: 'Sand', sage: 'Sage', silver: 'Silver', eva: 'EVA-01' },
  },
  zh: {
    canvas: 'Jumper 游乐场。WASD：行走。J/L：转向。空格：跳跃。R：重置。',
    section: '栏目', settings: '设置', retry: '重试', loading: '加载中',
    loadingRobot: '正在加载 Jumper', loadingRun: '正在准备赛道',
    loadFailed: '无法加载。', noWebgl: 'WebGL 不可用。',
    action: '动作', stopped: '已停止', preparing: '准备中', colour: '颜色', language: '语言',
    grid: '网格', collisions: '碰撞体', camera: '视角', front: '正面', top: '俯视',
    contacts: '个接触', evaSkin: 'EVA-01 · Jumper 的外观',
    provenance: ['原始策略 · MuJoCo', '仿真，未在硬件上校准'], simulator: '模拟器',
    start: '出发', pilot: '自动驾驶', pilotOn: '自动驾驶已开启', pause: '暂停', play: '播放', reset: '重置',
    back: '返回游乐场', jump: '跳跃', move: '移动 Jumper',
    hintSkate: 'Enter 出发 · ←/→ 转向 · W/S 重心 · P 自动驾驶 · R 重置',
    hintJumper: 'WASD · J/L · 空格 · 站在标牌前按 Enter 进入',
    pilotTag: '自动驾驶', again: '再来一次', clean: '未碰到锥桶', top_: '最高',
    cones: (n: number) => `撞倒 ${n} 个锥桶`,
    maps: { calle: ['街道', '滑板'], costa: ['海岸', '长板'], minimal: ['极简海岸', '长板'] },
    motions: {
      locomotion: '行走', jump: '跳跃', gesture_hello: '打招呼', gesture_bow: '鞠躬', gesture_paw: '伸爪', gesture_salute: '敬礼',
      dance_maze: '迷宫舞', dance_brazilian: '巴西舞', dance_crab: '螃蟹舞', dance_dream_wings: '梦之翼',
      claw_left: '左钳', claw_right: '右钳',
    },
    skins: { original: '原色', sand: '沙色', sage: '鼠尾草', silver: '银色', eva: 'EVA-01' },
  },
} satisfies Record<Lang, unknown>;
export type Strings = typeof strings.en;

export function storedLang(): Lang {
  try { const value = localStorage.getItem('jumper-lang'); if (value === 'en' || value === 'zh') return value; } catch { /* private mode */ }
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('zh') ? 'zh' : 'en';
}
export function storeLang(lang: Lang) { try { localStorage.setItem('jumper-lang', lang); } catch { /* private mode */ } }
