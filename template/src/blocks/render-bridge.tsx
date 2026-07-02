"use client";

// ============================================================================
// Client bridge mounted ONLY on /render/cms/* pages (the portal-embedded
// render surface). Speaks postMessage with the portal's RenderFrame:
//   → { type: "cms:height", value }          document height (auto-resize)
//   → { type: "cms:select", block, blockType } click-to-select in the canvas
//   ← { type: "cms:refresh" }                 re-render after a draft autosave
//   ← { type: "cms:scroll", block }           scroll a block into view
//   ← { type: "cms:highlight", section }      outline a section (sub-block key)
//   → { type: "cms:selectSection", section }  click-to-select a section
// No origin check on inbound messages is needed for safety (refresh/scroll are
// harmless), and the frame may legitimately be embedded by portal dev + prod
// origins; outbound messages use "*" because the payloads carry no secrets.
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RenderBridge() {
  const router = useRouter();

  useEffect(() => {
    const post = (message: Record<string, unknown>) => {
      window.parent?.postMessage(message, "*");
    };

    // -- height reporting (auto-resize the portal iframe)
    const reportHeight = () => {
      post({ type: "cms:height", value: document.documentElement.scrollHeight });
    };
    const resizeObserver = new ResizeObserver(reportHeight);
    resizeObserver.observe(document.documentElement);
    reportHeight();

    // -- click-to-select (delegated; finds the enclosing block marker)
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const sectionEl = target?.closest?.("[data-cms-subblock-key]");
      const el = target?.closest?.("[data-cms-block]");
      if (!sectionEl && !el) return;
      // block navigation inside the canvas — clicking selects, never navigates
      e.preventDefault();
      e.stopPropagation();
      if (sectionEl) {
        post({
          type: "cms:selectSection",
          section: sectionEl.getAttribute("data-cms-subblock-key"),
          block: el?.getAttribute("data-cms-block") ?? null,
        });
        return;
      }
      post({
        type: "cms:select",
        block: el!.getAttribute("data-cms-block"),
        blockType: el!.getAttribute("data-cms-block-type"),
      });
    };
    document.addEventListener("click", onClick, true);

    // -- inbound commands from the portal
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; block?: string; section?: string | null } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "cms:refresh") router.refresh();
      if (data.type === "cms:scroll" && data.block) {
        document
          .querySelector(`[data-cms-block="${CSS.escape(data.block)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (data.type === "cms:highlight") {
        const section = (data as { section?: string | null }).section;
        document.querySelectorAll<HTMLElement>("[data-cms-subblock-key]").forEach((node) => {
          const match = section != null && node.getAttribute("data-cms-subblock-key") === section;
          node.style.outline = match ? "2px solid #2563eb" : "";
          node.style.outlineOffset = match ? "2px" : "";
          if (match) node.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    };
    window.addEventListener("message", onMessage);

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("message", onMessage);
    };
  }, [router]);

  return null;
}
