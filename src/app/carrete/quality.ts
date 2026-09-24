import { useEffect, useState } from 'react';

export type MediaQuality = 'lite' | 'high';
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number };
type Device = Navigator & { connection?: Connection; deviceMemory?: number };
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
  const detect = () => automaticQuality(navigator as Device, matchMedia(compactQuery).matches);
  const [quality, setQuality] = useState<MediaQuality>(detect);
  useEffect(() => {
    const connection = (navigator as Device).connection;
    const compact = matchMedia(compactQuery);
    const update = () => setQuality(detect());
    connection?.addEventListener('change', update);
    compact.addEventListener('change', update);
    return () => {
      connection?.removeEventListener('change', update);
      compact.removeEventListener('change', update);
    };
  }, []);
  return quality;
}
