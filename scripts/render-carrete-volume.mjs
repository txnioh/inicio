// Uniform temporal samples at a fixed spatial resolution for the continuous volume.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const archive = JSON.parse(await readFile('src/app/carrete/instagram.json', 'utf8'));
for (const item of archive.filter(item => item.type === 'video')) {
  const input = path.join('public', item.src);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','json',input], {encoding:'utf8'}));
  const duration = Number(probe.format.duration), count = 240;
  const end = duration - Math.min(.04, duration * .01);
  const scale = Math.min(1, 320 / Math.max(item.width,item.height));
  const width = Math.max(2,Math.round(item.width*scale)), height = Math.max(2,Math.round(item.height*scale));
  const dir = input.replace(/\.mp4$/, '-volume');
  await mkdir(dir,{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-i',input,'-an','-vf',
    `fps=${(count-1)/end}:start_time=0,scale=${width}:${height},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${count},tile=8x8`,
    '-q:v','3','-start_number','0',path.join(dir,'%03d.jpg')]);
  await writeFile(path.join(dir,'index.json'),JSON.stringify({width,height,count,duration,columns:8,rows:8,
    times:Array.from({length:count},(_,i)=>i*end/(count-1)),sheets:['000.jpg','001.jpg','002.jpg','003.jpg']}));
  console.log(`${path.basename(dir)}: ${count} samples, ${width}×${height}`);
}
