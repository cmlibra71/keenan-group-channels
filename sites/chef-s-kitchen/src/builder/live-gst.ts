// Overlay the LIVE GST display state onto a composed page payload's context.
// The sealed price-block native used to read the storewide inclusive/exclusive
// toggle from useGst() at render time; the price-block MASTER instead reads
// context.gst.inclusive as a data fact. Each Builder*Page wrapper memoises this
// overlay on [payload, inclusive, pricesIncludeTax] so a toggle re-renders the
// BuilderTree with the freshly-chosen labels (dual ex/inc labels are already in
// the payload; only which one shows changes).

export function overlayLiveGst(
  payload: object,
  inclusive: boolean,
  pricesIncludeTax: boolean
): object {
  const p = payload as Record<string, unknown>;
  const ctx = (p.context as Record<string, unknown> | undefined) ?? {};
  return { ...p, context: { ...ctx, gst: { inclusive, pricesIncludeTax } } };
}
