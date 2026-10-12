// Records the scene as a clip ready to post: every rendered frame, a small
// caption, and a closing card with the challenge's tags. Only the 3D view is
// recorded; the page's interface stays out of the video.

const font = "Geist, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const endCard = 3;
/** X and YouTube want more than 15 seconds. */
export const minimumClip = 16;

/** MP4 where the browser can encode it (X does not take WebM). */
function format() {
  for (const type of ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) if (MediaRecorder.isTypeSupported(type)) return type;
  return '';
}

export function canRecord() {
  return typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && format() !== '';
}

export class ClipRecorder {
  private out = document.createElement('canvas');
  private context = this.out.getContext('2d')!;
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private started = performance.now();
  private sized = false;

  constructor(private caption: () => string) {
    const type = format();
    this.recorder = new MediaRecorder(this.out.captureStream(60), { mimeType: type, videoBitsPerSecond: 12_000_000 });
    this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
  }

  get seconds() { return (performance.now() - this.started) / 1000; }
  get extension() { return this.recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'; }

  /** Call with the freshly rendered WebGL canvas. */
  frame = (source: HTMLCanvasElement) => {
    if (!this.sized) {
      // At most 1920×1080 and even sides, which every encoder accepts.
      const scale = Math.min(1, 1920 / source.width, 1080 / source.height);
      this.out.width = Math.round(source.width * scale / 2) * 2;
      this.out.height = Math.round(source.height * scale / 2) * 2;
      this.sized = true;
      this.recorder.start(1000);
      this.started = performance.now();
    }
    const { width, height } = this.out;
    // Cover, in case the window is resized while recording.
    const scale = Math.max(width / source.width, height / source.height);
    const w = source.width * scale, h = source.height * scale;
    this.context.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
    const unit = height / 1080;
    this.context.font = `500 ${Math.round(22 * unit)}px ${font}`;
    // A pill like the page's own, so it reads over the road or the sea.
    const text = this.caption(), pad = 14 * unit, size = 22 * unit;
    const box = this.context.measureText(text).width + pad * 2;
    this.context.fillStyle = '#fdfdfcd9';
    this.context.beginPath();
    this.context.roundRect(36 * unit, height - 36 * unit - size * 1.7, box, size * 1.7, size);
    this.context.fill();
    this.context.fillStyle = '#111111';
    this.context.textBaseline = 'middle';
    this.context.fillText(text, 36 * unit + pad, height - 36 * unit - size * 0.85);
  };

  /** Fades to the closing card, then returns the clip (none if nothing was drawn). */
  async stop(): Promise<Blob | null> {
    if (!this.sized) { this.cancel(); return null; }
    const { width, height } = this.out;
    const last = document.createElement('canvas');
    last.width = width; last.height = height;
    last.getContext('2d')!.drawImage(this.out, 0, 0);
    const begin = performance.now();
    await new Promise<void>(done => {
      const card = (now: number) => {
        const t = (now - begin) / 1000;
        this.drawCard(last, Math.min(1, t / 0.6));
        if (t < endCard) requestAnimationFrame(card); else done();
      };
      requestAnimationFrame(card);
    });
    const stopped = new Promise(done => { this.recorder.onstop = done; });
    this.recorder.stop();
    await stopped;
    this.recorder.stream.getTracks().forEach(track => track.stop());
    return new Blob(this.chunks, { type: this.recorder.mimeType.split(';')[0] });
  }

  cancel() {
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder.stream.getTracks().forEach(track => track.stop());
  }

  private drawCard(last: HTMLCanvasElement, fade: number) {
    const { width, height } = this.out;
    const c = this.context, unit = height / 1080;
    c.globalAlpha = 1;
    c.drawImage(last, 0, 0);
    c.globalAlpha = fade;
    c.fillStyle = '#fdfdfc';
    c.fillRect(0, 0, width, height);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#111111';
    c.font = `500 ${Math.round(72 * unit)}px ${font}`;
    c.fillText('Jumper', width / 2, height / 2 - 40 * unit);
    c.fillStyle = '#77766f';
    c.font = `400 ${Math.round(26 * unit)}px ${font}`;
    c.fillText('Original KingKong policies · MuJoCo in the browser', width / 2, height / 2 + 14 * unit);
    c.fillStyle = '#111111';
    c.font = `500 ${Math.round(26 * unit)}px ${font}`;
    c.fillText('#Jumper #CrabRobot #OpenSourceRobot · @KingKong Robotics', width / 2, height / 2 + 80 * unit);
    c.textAlign = 'start';
    c.globalAlpha = 1;
  }
}
