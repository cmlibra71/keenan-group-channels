"use client";
import * as React from "react";
import { useEffect, useRef } from "react";
import grapesjs from "grapesjs";
import type { Editor, ProjectData } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";

// Productionised from the proven spike bridge. Phase 2 scope: freeform HTML/CSS
// editing + design-token Style Manager + CSS-in-iframe mirroring, with the
// editor talking to the portal parent over postMessage (never writing directly —
// the portal owns the DB write). Live React widgets are registered in Phase 3.
//
// postMessage protocol (this iframe ↔ portal parent):
//   → builder:ready                      (editor mounted)
//   → builder:save   { project, html, css }   (debounced autosave + on flush)
//   ← builder:flush                      (portal asks for an immediate save before publish)
//   → builder:saved                      (ack after a flush-triggered save)

type TokenColor = { id: string; label: string; value: string };

// Product-template widgets: draggable blocks that export a data-kg-widget marker.
// In the canvas they show a labelled placeholder (the real widgets are async
// server components rendered live on the storefront via BuilderRenderer →
// BlockRenderer); editors position and freeform-style around them.
const PRODUCT_WIDGETS: { key: string; label: string }[] = [
  { key: "product_buybox", label: "Buy box (gallery + price + add to cart)" },
  { key: "product_tabs", label: "Description / specs / reviews" },
  { key: "product_related", label: "Related products" },
  { key: "product_links", label: "Brand / category links" },
];

function productWidgetsPlugin(editor: Editor) {
  for (const { key, label } of PRODUCT_WIDGETS) {
    editor.DomComponents.addType(key, {
      isComponent: (el) =>
        (el as HTMLElement)?.getAttribute?.("data-kg-widget") === key ? { type: key } : undefined,
      model: {
        defaults: {
          tagName: "div",
          attributes: { "data-kg-widget": key },
          editable: false,
          droppable: false,
        },
      },
      view: {
        onRender(props: { el: HTMLElement }) {
          const el = props?.el ?? (this as unknown as { el: HTMLElement }).el;
          const store = el as HTMLElement & { __kg?: boolean };
          if (store.__kg) return;
          store.__kg = true;
          el.innerHTML =
            `<div style="padding:20px;border:1px dashed #9aa2ad;border-radius:8px;` +
            `color:#5b6470;font:14px/1.5 system-ui,sans-serif;text-align:center;background:#f7f8fa">` +
            `◱ ${label}<br><span style="font-size:12px;opacity:.7">renders live on the storefront</span></div>`;
        },
      },
    });
    editor.BlockManager.add(key, {
      label,
      category: "Product",
      content: `<div data-kg-widget="${key}"></div>`,
    });
  }
}

export default function BuilderEditor({
  initialProject,
  tokenColors = [],
}: {
  initialProject?: ProjectData | null;
  tokenColors?: TokenColor[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    if (!hostRef.current || editorRef.current) return;

    const editor = grapesjs.init({
      container: hostRef.current,
      height: "100vh",
      storageManager: false, // saving goes through postMessage → portal, not GrapesJS storage
      fromElement: false,
      plugins: [productWidgetsPlugin], // registered before any loadProjectData (order-safe)
      // Design-token color swatches so freeform styling stays on-brand.
      colorPicker: { appendTo: "parent" },
      styleManager: {
        sectors: [
          { name: "Layout", properties: ["display", "width", "height", "padding", "margin"] },
          { name: "Flex", properties: ["flex-direction", "justify-content", "align-items", "gap"] },
          { name: "Typography", properties: ["font-family", "font-size", "font-weight", "line-height", "color", "text-align"] },
          { name: "Background", properties: ["background-color"] },
          { name: "Border", properties: ["border-radius", "border"] },
        ],
      },
    });
    editorRef.current = editor;

    // Offer design tokens as color options wherever a color is picked.
    if (tokenColors.length) {
      const opts = tokenColors.map((t) => ({ id: t.id, label: t.label, value: t.value }));
      for (const prop of ["color", "background-color"]) {
        const p = editor.StyleManager.getProperty("Typography", prop) ||
          editor.StyleManager.getProperty("Background", prop);
        // Attach as selectable swatches; GrapesJS surfaces these in the color picker.
        if (p && typeof (p as { set?: unknown }).set === "function") {
          (p as unknown as { set: (k: string, v: unknown) => void }).set("options", opts);
        }
      }
    }

    // Load an existing draft document (types are registered before this in Phase 3).
    if (initialProject) {
      try {
        editor.loadProjectData(initialProject);
      } catch {
        /* fall back to empty canvas */
      }
    }

    // CSS-in-iframe: mirror the parent doc's stylesheets + <html> token/font
    // attributes into the canvas iframe so Tailwind v4 + tokens + fonts resolve.
    editor.on("load", () => {
      const cdoc = editor.Canvas.getDocument() as Document | undefined;
      if (!cdoc) return;
      const pHtml = document.documentElement;
      cdoc.documentElement.className = pHtml.className;
      const style = pHtml.getAttribute("style");
      if (style) cdoc.documentElement.setAttribute("style", style);
      document
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((n) => cdoc.head.appendChild(n.cloneNode(true)));
      post("builder:ready", {});
    });

    // Debounced autosave to the portal parent.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const snapshot = () => ({
      project: editor.getProjectData(),
      html: editor.getHtml(),
      css: editor.getCss(),
    });
    const post = (type: string, payload: Record<string, unknown>) =>
      window.parent?.postMessage({ type, ...payload }, "*");
    const scheduleSave = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => post("builder:save", snapshot()), 800);
    };
    editor.on("update", scheduleSave);
    editor.on("component:update", scheduleSave);
    editor.on("styleable:change", scheduleSave);

    // Inbound from the portal parent (which owns the DB reads/writes):
    //   builder:load  { project }  → hydrate the editor with the saved draft
    //   builder:flush              → immediate save before publish
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (t === "builder:load" && e.data.project) {
        try {
          editor.loadProjectData(e.data.project as ProjectData);
        } catch {
          /* keep current canvas */
        }
      } else if (t === "builder:flush") {
        // Portal serializes save→publish off this message; no separate ack.
        post("builder:save", snapshot());
      }
    };
    window.addEventListener("message", onMsg);

    return () => {
      window.removeEventListener("message", onMsg);
      if (timer) clearTimeout(timer);
      editor.destroy();
      editorRef.current = null;
    };
  }, [initialProject, tokenColors]);

  return <div ref={hostRef} />;
}
