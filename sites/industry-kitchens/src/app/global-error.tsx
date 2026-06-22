"use client";

import { useEffect } from "react";

// Root-level boundary: replaces the whole document when the root layout itself
// throws, so it must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: "5rem 1.5rem",
          color: "#1a1a1a",
          background: "#f7f8f7",
          margin: 0,
        }}
      >
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>We hit a snag</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Something went wrong loading the site. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            background: "#00786F",
            color: "#fff",
            border: "none",
            padding: "0.75rem 1.5rem",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "1rem",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
