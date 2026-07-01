import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { MegaMenuShell } from "./MegaMenuShell";
import type { HeaderNavItem } from "@/lib/store";

/**
 * Editor-driven header nav (from `nav_structure.header`). Rendered in place of the
 * category mega-menu when the Navigation editor has custom header items. Top-level
 * items may have a simple dropdown of children. Styled to match the mega-menu bar.
 */
export function CustomNav({ items }: { items: HeaderNavItem[] }) {
  return (
    <MegaMenuShell className="hidden lg:block bg-brand-deep relative">
      <div className="container-page">
        <ul className="flex items-stretch gap-0.5">
          {items.map((item, i) => (
            <li key={item.url + i} className="group/nav relative">
              <Link
                href={item.url || "#"}
                className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-[#EAF2EC] transition-colors duration-200 group-hover/nav:bg-black/20 group-hover/nav:text-white group-focus-within/nav:bg-black/20"
              >
                {item.label}
                {item.children && item.children.length > 0 && (
                  <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
                )}
              </Link>
              {item.children && item.children.length > 0 && (
                <div className="invisible absolute left-0 top-full z-50 min-w-[220px] rounded-b-card border border-black/5 bg-white py-2 opacity-0 shadow-hover transition-all duration-150 group-hover/nav:visible group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:opacity-100">
                  {item.children.map((child, j) => (
                    <Link
                      key={child.url + j}
                      href={child.url || "#"}
                      className="block px-4 py-2 text-[13.5px] text-text-primary transition-colors hover:bg-brand-tint hover:text-brand-deep"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
          <li className="flex-1" aria-hidden />
        </ul>
      </div>
    </MegaMenuShell>
  );
}
