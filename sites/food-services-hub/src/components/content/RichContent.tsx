"use client";

import { useState } from "react";

/**
 * Handlebar command registry.
 *
 * Add new commands here. Each command receives its parsed attributes
 * and optionally the content before/after the tag.
 *
 * Usage in HTML content:
 *   {{code type="readmore" label="Read More"}}
 *   {{code type="divider"}}
 *   {{code type="callout" text="Free shipping on orders over $500"}}
 */

type CommandProps = {
  attrs: Record<string, string>;
};

const commands: Record<string, React.FC<CommandProps>> = {
  readmore: ReadMore,
  divider: Divider,
  callout: Callout,
};

// ── Commands ──────────────────────────────────────────────────────────

function ReadMore({ attrs }: CommandProps) {
  const [expanded, setExpanded] = useState(false);
  const label = attrs.label || "Read More";
  const collapseLabel = attrs.collapseLabel || "Show Less";

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="text-sm font-medium text-zinc-600 hover:text-zinc-900 underline underline-offset-2 transition-colors"
      data-readmore-toggle
      data-expanded={expanded ? "true" : "false"}
    >
      {expanded ? collapseLabel : label}
    </button>
  );
}

function Divider() {
  return <hr className="my-6 border-zinc-200" />;
}

function Callout({ attrs }: CommandProps) {
  const text = attrs.text || "";
  const variant = attrs.variant || "info";
  const styles: Record<string, string> = {
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    success: "bg-green-50 border-green-200 text-green-800",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[variant] || styles.info}`}>
      {text}
    </div>
  );
}

// ── Parser ────────────────────────────────────────────────────────────

const HANDLEBAR_REGEX = /\{\{code\s+([^}]*)\}\}/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function splitByHandlebars(html: string) {
  const parts: Array<{ type: "html"; content: string } | { type: "command"; commandType: string; attrs: Record<string, string> }> = [];
  let lastIndex = 0;
  let match;

  const regex = new RegExp(HANDLEBAR_REGEX.source, "g");
  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "html", content: html.slice(lastIndex, match.index) });
    }
    const attrs = parseAttrs(match[1]);
    parts.push({ type: "command", commandType: attrs.type || "", attrs });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    parts.push({ type: "html", content: html.slice(lastIndex) });
  }

  return parts;
}

/**
 * Close unclosed inline formatting tags so they don't leak out of a
 * dangerouslySetInnerHTML container and break React hydration.
 */
function closeOpenTags(html: string): string {
  const openTags: string[] = [];
  const tagRegex = /<\/?(\w+)[^>]*\/?>/g;
  const inlineTags = new Set(["b", "i", "em", "strong", "a", "u", "s", "span", "small", "sub", "sup", "mark", "font"]);
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!inlineTags.has(tagName)) continue;
    if (match[0].endsWith("/>")) continue;
    if (match[0][1] === "/") {
      const idx = openTags.lastIndexOf(tagName);
      if (idx !== -1) openTags.splice(idx, 1);
    } else {
      openTags.push(tagName);
    }
  }

  return html + openTags.reverse().map((t) => `</${t}>`).join("");
}

// ── Component ─────────────────────────────────────────────────────────

export function RichContent({
  html,
  className = "",
  stripStyles = false,
}: {
  html: string;
  className?: string;
  stripStyles?: boolean;
}) {
  const cleaned = stripStyles ? html.replace(/style="[^"]*"/gi, "") : html;
  const parts = splitByHandlebars(cleaned);

  // Check if there's a readmore command — need special handling
  const readmoreIndex = parts.findIndex(
    (p) => p.type === "command" && p.commandType === "readmore"
  );

  if (readmoreIndex === -1) {
    // No readmore — render normally
    return (
      <div className={className}>
        {parts.map((part, i) => {
          if (part.type === "html") {
            return <div key={i} dangerouslySetInnerHTML={{ __html: closeOpenTags(part.content) }} />;
          }
          const Command = commands[part.commandType];
          return Command ? <Command key={i} attrs={part.attrs} /> : null;
        })}
      </div>
    );
  }

  // Has readmore — split into visible/hidden sections
  return <ReadMoreContent parts={parts} readmoreIndex={readmoreIndex} className={className} />;
}

function ReadMoreContent({
  parts,
  readmoreIndex,
  className,
}: {
  parts: ReturnType<typeof splitByHandlebars>;
  readmoreIndex: number;
  className: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const beforeParts = parts.slice(0, readmoreIndex);
  const readmorePart = parts[readmoreIndex];
  const afterParts = parts.slice(readmoreIndex + 1);
  const label = readmorePart.type === "command" ? (readmorePart.attrs.label || "Read More") : "Read More";
  const collapseLabel = readmorePart.type === "command" ? (readmorePart.attrs.collapseLabel || "Show Less") : "Show Less";

  return (
    <div className={className}>
      {beforeParts.map((part, i) => {
        if (part.type === "html") {
          return <div key={i} dangerouslySetInnerHTML={{ __html: closeOpenTags(part.content) }} />;
        }
        const Command = commands[part.commandType];
        return Command ? <Command key={i} attrs={part.attrs} /> : null;
      })}

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 underline underline-offset-2 transition-colors my-2"
      >
        {expanded ? collapseLabel : label}
      </button>

      {expanded && afterParts.map((part, i) => {
        if (part.type === "html") {
          return <div key={`after-${i}`} dangerouslySetInnerHTML={{ __html: closeOpenTags(part.content) }} />;
        }
        const Command = commands[part.commandType];
        return Command ? <Command key={`after-${i}`} attrs={part.attrs} /> : null;
      })}
    </div>
  );
}
