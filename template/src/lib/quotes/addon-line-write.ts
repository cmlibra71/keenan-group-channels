// ============================================================================
// WHAT AN "ADD TO QUOTE" DOES TO A LINE THAT IS ALREADY THERE — card 0CDcCYmO.
//
// A quote holds ONE line per product+variant, so a second press of Add to Quote is
// either "one more of these" or "I have re-configured this one". Getting that wrong
// is destructive in both directions, and two of the ways it went wrong were only
// visible once the paid extras (and, before them, bundle builds) started writing a
// configuration onto the line:
//
//   * A listing TILE posts no selection at all — `master-leaves.tsx` calls
//     `addToQuote(id, null)`, and so does the related-product rail through the node
//     bridge. Reading that as "the shopper deselected everything" wiped the blades
//     the customer had chosen on the product page, refused to increment the
//     quantity, and erased the line's comment — from a tile, with no control
//     anywhere to say "keep my configuration". `addonsPosted` is the distinction:
//     an empty OBJECT is a deliberate clear-down, `undefined`/`null` is "the panel
//     was never on screen, leave the configuration alone".
//
//   * `quote_items.customer_notes` is printed to the CUSTOMER on `/q/<uuid>` and in
//     the emailed PDF, and it is also where a REP types. quotes.md records the rule
//     [card 7bmpuqei]: the storefront rewrites that comment only when the line has
//     none, or when the comment on it is the one the storefront wrote last time.
//     Nothing had ever implemented it. `ownedNote` is that marker
//     (`attributes.storefront_note`), and a rep's words now survive both a
//     re-configuration and a clear-down. The picks land structurally in
//     `attributes.addon_selection` either way, so the configuration is never lost
//     even on a line whose comment we must leave alone.
//
// Pure, so both of those can be proved without a database.
// ============================================================================

export interface QuoteLineWriteInput {
  /** Did the caller RENDER the extras panel? A listing tile posts nothing at all. */
  addonsPosted: boolean;
  /** Does the line already carry recorded extras? */
  hadAddons: boolean;
  /** How many extras resolved out of what was posted. */
  resolvedAddonCount: number;
  /** A BUNDLE build — its picks are a configuration in the same sense [7bmpuqei]. */
  isBundleBuild: boolean;
  /** The comment this add would like to leave (kit lines + extras lines), or null. */
  lineNotes: string | null;
  /** The comment sitting on the line right now. */
  existingNote: string | null;
  /** The comment the storefront wrote last time (`attributes.storefront_note`). */
  ownedNote: string | null;
}

export interface QuoteLineWrite {
  /** A plain re-add counts up; a re-configuration replaces and does NOT stack. */
  incrementsQuantity: boolean;
  /** Set `attributes.addon_selection` to null — every extra was deliberately taken off. */
  clearsAddons: boolean;
  /** Write `customer_notes` and stamp the ownership marker beside it. */
  writesNote: boolean;
}

export function decideQuoteLineWrite(input: QuoteLineWriteInput): QuoteLineWrite {
  const {
    addonsPosted,
    hadAddons,
    resolvedAddonCount,
    isBundleBuild,
    lineNotes,
    existingNote,
    ownedNote,
  } = input;

  // Taking every extra off is a re-configuration and has to REMOVE the record — a line
  // priced as a bare machine that still lists $725 of blades is exactly the stale record
  // the cart half of this card refuses. Only when the panel was on screen, though.
  const clearsAddons = addonsPosted && hadAddons && resolvedAddonCount === 0;
  const isConfigured = isBundleBuild || resolvedAddonCount > 0 || clearsAddons;

  const noteIsOurs = existingNote === null || existingNote === "" || existingNote === ownedNote;
  const writesNote = isConfigured && noteIsOurs;

  return {
    // Comparing against the note we OWN, not against whatever is on the line: a rep's
    // typed comment would otherwise read as "this line changed" on every press.
    incrementsQuantity: !(isConfigured && lineNotes !== ownedNote),
    clearsAddons,
    writesNote,
  };
}
