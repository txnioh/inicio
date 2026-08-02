'use client';

import { useEffect, useState } from 'react';

const madridTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

export default function LocalTime() {
  const [time, setTime] = useState('--:--');

  useEffect(() => {
    const updateTime = () => {
      setTime(madridTimeFormatter.format(new Date()));
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return time;
}
