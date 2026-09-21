// Generate every decoded frame, with its presentation timestamp. Run when clips change.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const archive = JSON.parse(await readFile('src/app/carrete/instagram.json', 'utf8'));
for (const item of archive.filter(item => item.type === 'video')) {
  const input = path.join('public', item.src);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_frames', '-show_streams', '-show_entries',
    'stream=width,height,nb_frames:frame=best_effort_timestamp_time', '-of', 'json', input],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const times = probe.frames.map(frame => Number(frame.best_effort_timestamp_time));
  if (!times.length || times.some((time, index) => !Number.isFinite(time) || (index > 0 && time < times[index - 1]))) {
    throw new Error(`Invalid frame timestamps: ${input}`);
  }
  const track = probe.streams[0];
  if (track.nb_frames && Number(track.nb_frames) !== times.length) throw new Error(`Missing frames: ${input}`);
  const columns = 8;
  const rows = 8;
  const sheetCount = Math.ceil(times.length / (columns * rows));
  // Cap the entire decoded atlas at 12 million pixels, including the last sheet's padding.
  const scale = Math.min(240 / Math.max(track.width, track.height),
    Math.sqrt(12_000_000 / (sheetCount * columns * rows * track.width * track.height)));
  const width = Math.max(2, Math.floor(track.width * scale / 2) * 2);
  const height = Math.max(2, Math.floor(track.height * scale / 2) * 2);
  const output = input.replace(/\.mp4$/, '-frames');
  await mkdir(output, { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-an',
    '-vf', `scale=${width}:${height},tile=${columns}x${rows}`, '-fps_mode', 'passthrough',
    '-q:v', '4', '-start_number', '0', path.join(output, '%03d.jpg')]);
  const sheets = Array.from({ length: sheetCount }, (_, index) => `${String(index).padStart(3, '0')}.jpg`);
  const files = await readdir(output);
  if (sheets.some(sheet => !files.includes(sheet))) throw new Error(`Missing atlas: ${output}`);
  await writeFile(path.join(output, 'index.json'), JSON.stringify({ columns, rows, width, height, times, sheets }));
  console.log(`${path.basename(input)}: ${times.length} frames, ${sheetCount} sheets (${width}×${height})`);
}
