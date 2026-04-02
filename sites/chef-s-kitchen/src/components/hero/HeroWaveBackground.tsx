"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useWaveScene } from "./useWaveScene";

interface HeroWaveBackgroundProps {
  imageCount: number;
}

function WaveCanvas({ imageCount }: HeroWaveBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  const onReady = useCallback(() => setReady(true), []);

  useWaveScene(containerRef, onReady, imageCount, reducedMotion);

  if (isMobile) {
    return (
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%)",
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 transition-opacity duration-1000 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    />
  );
}

export default function HeroWaveBackground({
  imageCount,
}: HeroWaveBackgroundProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <WaveCanvas imageCount={imageCount} />;
}
