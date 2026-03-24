"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: no clipboard API
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-ink-faint hover:text-ink-light transition-colors duration-300"
      aria-label="Copy code"
    >
      {copied ? (
        <Check className="h-4 w-4 text-teal" strokeWidth={1.5} />
      ) : (
        <Copy className="h-4 w-4" strokeWidth={1.5} />
      )}
    </button>
  );
}
