/** Bumped only to reach browsers still holding a year-long `immutable` copy. */
export const IMAGE_URL_EPOCH = 2;

export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  // If it's already a relative path or data URL, return as-is
  if (src.startsWith("/") || src.startsWith("data:")) {
    return src;
  }
  // `v=2` is a one-off cache-buster, not a parameter the route reads (cards stH1U00j + L1gFfhko):
  // until 2026-09 every response was served `immutable` for a year, so a browser that saw a photo
  // before it was replaced would never ask again. A new URL reaches it; the route now answers with
  // a short max-age + ETag, so this should never need bumping again.
  return `/api/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 80}&v=${IMAGE_URL_EPOCH}`;
}
