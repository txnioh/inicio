import { useEffect, useState } from 'react';

export type MediaQuality = 'lite' | 'high';
export type QualityPreference = 'auto' | MediaQuality;
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number };
type Device = Navigator & { connection?: Connection; deviceMemory?: number };
const storageKey = 'carrete-quality-v1';
const compactQuery = '(max-width: 600px), (pointer: coarse) and (max-width: 1024px)';

export function automaticQuality(device: Pick<Device, 'connection' | 'deviceMemory' | 'hardwareConcurrency'>, compactDevice: boolean): MediaQuality {
  const network = device.connection;
  if (network?.saveData || ['slow-2g', '2g', '3g'].includes(network?.effectiveType ?? '')
    || (network?.downlink !== undefined && network.downlink < 3)
    || (network?.rtt !== undefined && network.rtt >= 500)) return 'lite';
  if ((device.deviceMemory !== undefined && device.deviceMemory <= 4)
    || (device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 4)) return 'lite';
  // Safari/Firefox may not expose connection or memory information. Prefer
  // lower transfer and GPU cost on small screens and compact touch devices.
  return compactDevice ? 'lite' : 'high';
}

export function useMediaQuality() {
  const [preference, setPreference] = useState<QualityPreference>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'lite' || saved === 'high') return saved;
    } catch { /* Storage is optional. */ }
    return 'auto';
  });
  const detect = () => automaticQuality(navigator as Device, matchMedia(compactQuery).matches);
  const [automatic, setAutomatic] = useState<MediaQuality>(detect);
  useEffect(() => {
    const connection = (navigator as Device).connection;
    const compact = matchMedia(compactQuery);
    const update = () => setAutomatic(detect());
    connection?.addEventListener('change', update);
    compact.addEventListener('change', update);
    return () => {
      connection?.removeEventListener('change', update);
      compact.removeEventListener('change', update);
    };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(storageKey, preference); }
    catch { /* Keep the current choice when storage is unavailable. */ }
  }, [preference]);
  return { preference, resolved: preference === 'auto' ? automatic : preference, setPreference };
}

export type QualityControl = ReturnType<typeof useMediaQuality>;
