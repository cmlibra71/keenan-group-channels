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
  return `/api/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 80}`;
}
