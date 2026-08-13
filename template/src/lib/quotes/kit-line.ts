// ============================================================================
// Writing a kit build onto a QUOTE LINE — card 7bmpuqei.
//
// `quote_items.attributes` and `quote_items.customer_notes` are SHARED columns with other owners,
// and the storefront is the least privileged writer of the two:
//
//   attributes     — carries the indent (special-order) tick, whose IND-01 notice travels with the
//                    quote to the customer [card Iy3jZrMl], the custom-line approval state
//                    [card p888Rl1q], and `zoey_item_id` / `parent_item_id` / `product_type` on
//                    tens of thousands of ingested rows. The column is REPLACED WHOLESALE on write
//                    (see portal `src/lib/quotes/indent.ts`), which is why every writer merges.
//   customer_notes — the rep's per-line Comment box in the quote editor, and it is rendered to the
//                    customer on /q/[uuid] and its print. A storefront add must never delete what
//                    a rep wrote there.
//
// So: attributes are merged, and the note is only written when the line has none or when the only
// note on it is the one this feature wrote last time (`attributes.kit_note` is that marker).
// ============================================================================

export function parseBag(value: unknown): Record<string, unknown> | null {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  return source && typeof source === "object" && !Array.isArray(source)
    ? (source as Record<string, unknown>)
    : null;
}

/**
 * The whole attributes object to write back: everything already on the line, with the kit keys
 * laid over the top. Null when this add has no kit keys — then the column is not written at all.
 */
export function mergeKitAttributes(
  existing: unknown,
  kitAttributes: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!kitAttributes) return null;
  return { ...(parseBag(existing) ?? {}), ...kitAttributes };
}

/** The kit note this feature last wrote onto the line, if any. */
export function readOwnKitNote(existing: unknown): string | null {
  const note = parseBag(existing)?.kit_note;
  return typeof note === "string" && note.trim() !== "" ? note : null;
}

/**
 * The `customerNotes` field to include in the update — or null to leave the column alone.
 *
 * Written when the line has no note yet, or when the note on it is the one this feature wrote (the
 * customer re-configured, so the description is ours to refresh). A note a rep typed, or a note
 * that has been edited, is never overwritten: it is a document the customer is reading.
 */
export function kitNoteWrite(
  currentNote: string | null | undefined,
  existingAttributes: unknown,
  kitNote: string | null
): { customerNotes: string } | null {
  if (!kitNote) return null;
  const current = typeof currentNote === "string" ? currentNote.trim() : "";
  if (current === "" || current === readOwnKitNote(existingAttributes)?.trim()) {
    return { customerNotes: kitNote };
  }
  return null;
}
