// A made-up terminal station with eight tracks. Every day gets its own
// timetable, seeded by the date, so the board is the same for everyone and
// reloading never reshuffles it. Times are minutes since the Unix epoch, on
// Madrid's wall clock.

export const TRACKS = 8;

export type Service = 'AV' | 'LD' | 'MD';
export const serviceNames: Record<Service, string> = { AV: 'Alta velocidad', LD: 'Larga distancia', MD: 'Media distancia' };

const routes: { service: Service; destination: string; stops: string[]; weight: number }[] = [
  { service: 'AV', destination: 'Sevilla', stops: ['Ciudad Real', 'Puertollano', 'Córdoba'], weight: 4 },
  { service: 'AV', destination: 'Málaga', stops: ['Córdoba', 'Antequera'], weight: 3 },
  { service: 'AV', destination: 'Barcelona', stops: ['Guadalajara', 'Zaragoza', 'Lleida', 'Tarragona'], weight: 4 },
  { service: 'AV', destination: 'Valencia', stops: ['Cuenca', 'Requena'], weight: 3 },
  { service: 'AV', destination: 'Alicante', stops: ['Cuenca', 'Albacete', 'Villena'], weight: 2 },
  { service: 'AV', destination: 'Granada', stops: ['Córdoba', 'Antequera', 'Loja'], weight: 1 },
  { service: 'LD', destination: 'Cádiz', stops: ['Córdoba', 'Sevilla', 'Jerez'], weight: 1 },
  { service: 'LD', destination: 'Badajoz', stops: ['Talavera', 'Cáceres', 'Mérida'], weight: 1 },
  { service: 'LD', destination: 'Huelva', stops: ['Córdoba', 'Sevilla', 'La Palma'], weight: 1 },
  { service: 'MD', destination: 'Toledo', stops: [], weight: 3 },
  { service: 'MD', destination: 'Jaén', stops: ['Aranjuez', 'Alcázar', 'Linares'], weight: 1 },
  { service: 'MD', destination: 'Ciudad Real', stops: ['Aranjuez', 'Alcázar'], weight: 1 },
];

export type Train = {
  id: string;
  service: Service;
  number: string;
  destination: string;
  stops: string[];
  // Where the train comes in from before it turns round here.
  origin: string;
  // Scheduled departure, and the expected one once the delay is added.
  scheduled: number;
  departure: number;
  delay: number;
  track: number;
};

// When things happen, in minutes relative to the expected departure.
export const ARRIVE = -24;
export const ENTER = 1.5;
export const ANNOUNCE = -20;
export const BOARD = -15;
export const CLOSE = -2;
export const LEAVE = 1.5;

export type Phase = 'scheduled' | 'announced' | 'boarding' | 'closing' | 'departed';

export function phase(train: Train, now: number): Phase {
  const t = now - train.departure;
  if (t >= 0) return 'departed';
  if (t >= CLOSE) return 'closing';
  if (t >= BOARD) return 'boarding';
  if (t >= ANNOUNCE) return 'announced';
  return 'scheduled';
}

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const days = new Map<number, Train[]>();

export function day(index: number): Train[] {
  const cached = days.get(index);
  if (cached) return cached;
  const rand = random(index * 2654435761);
  const total = routes.reduce((sum, route) => sum + route.weight, 0);
  const trains: Train[] = [];
  const freeAt = Array<number>(TRACKS).fill(-Infinity);
  let minute = index * 1440 + 5 * 60 + 40;
  const last = index * 1440 + 23 * 60 + 20;
  let serial = 0;
  while (minute <= last) {
    let pick = rand() * total;
    const route = routes.find(item => (pick -= item.weight) < 0) ?? routes[0];
    const delay = rand() < .18 ? 3 + Math.floor(rand() * 14) : 0;
    const departure = minute + delay;
    // Take the free track that has been empty the longest, so trains spread
    // across the hall instead of piling onto track 1.
    const from = departure + ARRIVE - 1;
    let track = -1;
    for (let i = 0; i < TRACKS; i++) if (freeAt[i] <= from && (track < 0 || freeAt[i] < freeAt[track] - rand() * 30)) track = i;
    if (track >= 0) {
      freeAt[track] = departure + LEAVE + .5;
      const base = route.service === 'AV' ? 3000 : route.service === 'LD' ? 700 : 17000;
      // The origin comes from its own hash, not `rand`, so adding it left
      // every day's timetable (and saved train ids) exactly as they were.
      const siblings = routes.filter(item => item.service === route.service);
      const origin = siblings[((Math.imul(index + 7, 0x9e3779b1) ^ Math.imul(serial + 3, 0x85ebca6b)) >>> 0) % siblings.length].destination;
      trains.push({
        id: `${index}-${serial++}`,
        origin,
        service: route.service,
        number: String(base + Math.floor(rand() * 900)).padStart(5, '0'),
        destination: route.destination,
        stops: route.stops,
        scheduled: minute,
        departure,
        delay,
        track: track + 1,
      });
    }
    // Rush hours run denser.
    const hour = (minute - index * 1440) / 60;
    const rush = (hour > 6.5 && hour < 9.5) || (hour > 17.5 && hour < 20.5);
    minute += (rush ? 5 : 7) + Math.floor(rand() * (rush ? 5 : 8));
  }
  days.set(index, trains);
  if (days.size > 6) days.delete(days.keys().next().value!);
  return trains;
}

// Everything that matters around `now`: trains still at the station and the
// ones due next, today's and tomorrow's.
export function around(now: number) {
  const today = Math.floor(now / 1440);
  return [...day(today - 1), ...day(today), ...day(today + 1)];
}

export function upcoming(now: number, count: number) {
  return around(now).filter(train => train.departure > now).sort((a, b) => a.departure - b.departure).slice(0, count);
}

const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
});

// Madrid's offset from UTC at `ms`, so the station runs on local time
// wherever the page is opened.
export function madridOffset(ms: number) {
  const parts = Object.fromEntries(offsetFormat.formatToParts(ms).map(part => [part.type, Number(part.value)]));
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

export const clock = (minute: number) => {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const weekdays = ['Jueves', 'Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes', 'Miércoles'];
const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function dateLabel(minute: number) {
  const index = Math.floor(minute / 1440);
  const date = new Date(index * 86_400_000);
  // Day 0 of the epoch was a Thursday.
  return `${weekdays[((index % 7) + 7) % 7]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}
