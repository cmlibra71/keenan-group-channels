"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { navModel, type NavData, type NavModel } from "@/lib/nav-model";

type NavDataContext = { model: NavModel | null; load: () => void };

const Ctx = createContext<NavDataContext>({ model: null, load: () => {} });

/**
 * Loads the header menu's data (lib/nav-model.ts) in the browser, ONCE per menu
 * version, for the drop-downs and the phone drawer to draw from.
 *
 * It is fetched as soon as the page is idle after load — so a drop-down is
 * already there by the time a pointer reaches the bar (whose panels open on a
 * 300ms hover-intent delay) — and immediately on any pointer, touch or focus in
 * the header, which covers a keyboard user tabbing straight into the bar. The
 * URL carries the content version, so after the first page the browser answers
 * it from its own cache.
 */
export function NavDataProvider({ src, children }: { src: string; children: React.ReactNode }) {
  const [data, setData] = useState<NavData | null>(null);
  const started = useRef<string | null>(null);

  const load = useCallback(() => {
    if (started.current === src) return;
    started.current = src;
    fetch(src)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { data: NavData }) => setData(body.data))
      .catch(() => {
        // Let the next interaction try again.
        if (started.current === src) started.current = null;
      });
  }, [src]);

  useEffect(() => {
    const onIntent = (e: Event) => {
      if ((e.target as Element | null)?.closest?.("header")) load();
    };
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("pointerdown", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);

    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(load, { timeout: 3000 });
      else timer = setTimeout(load, 1000);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("pointerdown", onIntent);
      document.removeEventListener("focusin", onIntent);
      window.removeEventListener("load", schedule);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [load]);

  const model = useMemo(() => (data ? navModel(data) : null), [data]);
  const value = useMemo(() => ({ model, load }), [model, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The loaded menu (null until it arrives) and a trigger to load it now. */
export function useNavData(): NavDataContext {
  return useContext(Ctx);
}
