import imageLoader from "./image-loader";
import { isAllowedImageUrl } from "./image-origin";

/**
 * The src the search dropdown loads a product thumbnail by (review of card stH1U00j).
 *
 * It used to be the S3 original itself. The Zoey image ingest now overwrites those originals in place
 * when a photo is replaced in Zoey, and they were stored `max-age=31536000` — so a shopper who had
 * searched before kept the old photo in the dropdown for up to a year while the product page showed
 * the new one. Through `/api/image` the thumbnail is keyed on the original's version and revalidated
 * on every load (`public, no-cache` + ETag), exactly like every other product picture on the site —
 * and a 100px copy instead of the full-size original. A URL `/api/image` would refuse (not one of the
 * allowlisted buckets) is not one the ingest writes, and is loaded as it is.
 */
export function searchThumbnailSrc(url: string): string {
  return isAllowedImageUrl(url) ? imageLoader({ src: url, width: 100, quality: 75 }) : url;
}
