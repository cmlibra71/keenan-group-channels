// @jsxRuntime automatic
// @jsxImportSource react
// (the two lines above are for the unit test: the repo's test runner starts at
//  the workspace ROOT, which has no tsconfig, so it would otherwise compile this
//  file with the classic React.createElement transform. A no-op under Next.)
// ============================================================================
// The allow-listed embed block — a Publuu flipbook catalogue on a content page
// (card pNKI15L2, Tim 2026-08-19).
//
// This component NEVER renders markup that came from an author. The block's
// stored prop is a URL, and `resolveEmbedSrc` (@keenan/services) is re-run on
// it here, at render time, because a stored prop is data and data is not
// trusted: anything whose host is not on the allow-list renders NOTHING. The
// <iframe> below is a real React element, so `dangerouslySetInnerHTML` and the
// storefront sanitiser — which drops <iframe> on purpose — are both untouched.
//
// Mirrored verbatim from template/src/blocks/EmbedBlock.tsx — keep the three in sync.
// ============================================================================
import type { FC } from "react";
import { resolveEmbedSrc } from "@keenan/services/cms";

type EmbedBlockProps = { props: Record<string, unknown> };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Shape of the frame. A flipbook is a two-page spread, so 3:2 is the default. */
const ASPECT: Record<string, string> = {
  "3:2": "3 / 2",
  "4:3": "4 / 3",
  "16:9": "16 / 9",
  "1:1": "1 / 1",
  "3:4": "3 / 4",
};

const WIDTH: Record<string, string> = {
  standard: "max-w-3xl",
  wide: "max-w-5xl",
  full: "max-w-none",
};

export const EmbedBlock: FC<EmbedBlockProps> = ({ props }) => {
  const src = resolveEmbedSrc(props.url);
  if (!src) return null;

  const aspect = ASPECT[str(props.aspect)] ?? ASPECT["3:2"];
  const width = WIDTH[str(props.width)] ?? WIDTH.wide;
  const title = str(props.title) || "Catalogue";

  return (
    <section className={`mx-auto w-full ${width} px-4 py-8`}>
      <div
        className="relative w-full overflow-hidden rounded-lg bg-zinc-100"
        style={{ aspectRatio: aspect }}
      >
        <iframe
          src={src}
          title={title}
          loading="lazy"
          allow="clipboard-write; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </section>
  );
};
