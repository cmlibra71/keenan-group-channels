"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  addToCompareList,
  parseCompareList,
  readCompareCookie,
  removeFromCompareList,
  serializeCompareCookie,
} from "./compare-list";

// The browser half of the compare list: one reading of the cookie that every
// control on the page shares, so pressing Add to Compare on the product page
// turns every other compare control on screen into "View Compare" at once.
// Changes are announced on a window event (this tab) and picked up from other
// tabs when the window regains focus.

const CHANGE_EVENT = "ik-compare-change";
const EMPTY: number[] = [];

let cachedRaw: string | null = null;
let cachedList: number[] = EMPTY;

function snapshot(): number[] {
  const raw = readCompareCookie(document.cookie);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parseCompareList(raw);
  }
  return cachedList;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("focus", onChange);
  };
}

/** Write the list and tell every subscribed control. */
export function writeCompareList(list: readonly number[]): void {
  document.cookie = serializeCompareCookie(list);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * The list, or NULL until the browser's cookie has been read (server render and the
 * hydration pass). The compare page uses this to show the server's own columns
 * until it knows better, rather than flashing an empty table.
 */
export function useCompareListOrNull(): number[] | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function useCompareList() {
  // The server has no cookie jar to hand here, so the first paint is an empty
  // list; the real one lands on hydration. A compare link reading "Add to
  // Compare" for one frame is the whole cost.
  const list = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const add = useCallback((id: number) => writeCompareList(addToCompareList(snapshot(), id)), []);
  const remove = useCallback((id: number) => writeCompareList(removeFromCompareList(snapshot(), id)), []);
  const clear = useCallback(() => writeCompareList([]), []);
  return { list, add, remove, clear, has: (id: number) => list.includes(id) };
}
