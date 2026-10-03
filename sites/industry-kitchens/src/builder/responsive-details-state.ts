/** The open state an accordion item should have at this width (pure). An
 *  attribute that is absent keeps the item as it is — except from 1280 px
 *  (`xl`), where an item with no data-open-xl follows its data-open-lg. */
export function detailsOpenFor(
  base: string | null,
  lg: string | null,
  isLg: boolean,
  current: boolean,
  xl: string | null = null,
  isXl = false
): boolean {
  const v = isXl && xl !== null ? xl : isLg || isXl ? lg : base;
  if (v === null) return current;
  return v === "open" || v === "true";
}
