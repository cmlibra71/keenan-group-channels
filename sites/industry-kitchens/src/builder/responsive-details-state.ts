/** The open state an accordion item should have at this width (pure). An
 *  attribute that is absent keeps the item as it is. */
export function detailsOpenFor(base: string | null, lg: string | null, isLg: boolean, current: boolean): boolean {
  const v = isLg ? lg : base;
  if (v === null) return current;
  return v === "open" || v === "true";
}
