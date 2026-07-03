"use client";

import { useEffect, useRef } from "react";
import { ga4ViewItemList, type Ga4Item } from "./ga4";

/**
 * Fires GA4 `view_item_list` when a product listing renders. Renders nothing.
 * Re-fires when the list identity changes (different list, filter change,
 * load-more) but not on unrelated re-renders — keyed on listId + item ids.
 */
export function Ga4ViewItemList({
  listId,
  listName,
  items,
}: {
  listId?: string;
  listName?: string;
  items: Ga4Item[];
}) {
  const firedKey = useRef<string | null>(null);
  const key = `${listId ?? ""}:${items.map((i) => i.item_id).join(",")}`;
  useEffect(() => {
    if (firedKey.current === key || items.length === 0) return;
    firedKey.current = key;
    ga4ViewItemList(items, listId, listName);
  }, [key, items, listId, listName]);
  return null;
}
