"use client";

import { useState, useEffect } from "react";

function getTimeLeft(target: Date) {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return { days, hours, minutes };
}

export function DrawCountdown({ targetDate }: { targetDate: string | Date }) {
  const target = new Date(targetDate);
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(target));

  useEffect(() => {
    const interval = setInterval(() => {
      const tl = getTimeLeft(target);
      setTimeLeft(tl);
      if (!tl) clearInterval(interval);
    }, 60000);
    return () => clearInterval(interval);
  }, [target.getTime()]);

  if (!timeLeft) {
    return <span className="text-xs text-ink-light">Draw complete</span>;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="bg-stone-warm px-2 py-1 text-center">
        <span className="font-bold text-navy">{timeLeft.days}</span>
        <span className="text-ink-light ml-0.5">d</span>
      </div>
      <div className="bg-stone-warm px-2 py-1 text-center">
        <span className="font-bold text-navy">{timeLeft.hours}</span>
        <span className="text-ink-light ml-0.5">h</span>
      </div>
      <div className="bg-stone-warm px-2 py-1 text-center">
        <span className="font-bold text-navy">{timeLeft.minutes}</span>
        <span className="text-ink-light ml-0.5">m</span>
      </div>
    </div>
  );
}
