"use client";

import { useState } from "react";

/**
 * Thin client wrapper that owns the only interactive bit of the mega menu:
 * the panels open on pure-CSS :hover/:focus-within, but after a soft (SPA)
 * navigation the header stays mounted with the cursor still over the bar, so a
 * panel would otherwise stay open. On any link click we set `data-suppressed`,
 * which force-hides every `.mega-panel` descendant (overriding hover) until the
 * pointer leaves the bar. Keeping this isolated lets MegaMenu stay a server
 * component.
 */
export function MegaMenuShell({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [suppressed, setSuppressed] = useState(false);

  return (
    <nav
      aria-label="Departments"
      data-suppressed={suppressed || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) {
          setSuppressed(true);
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
      onMouseLeave={() => setSuppressed(false)}
      className={`${className} [&[data-suppressed]_.mega-panel]:!invisible [&[data-suppressed]_.mega-panel]:!opacity-0`}
    >
      {children}
    </nav>
  );
}
