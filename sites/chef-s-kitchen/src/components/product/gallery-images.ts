/**
 * What the product gallery actually shows, as one pure decision.
 *
 * Card VNh9DdYd (and its twin qoGQCPTD): choosing a variation changes the
 * PICTURE, and Zoey's gallery then shows THAT picture — the parent product's
 * photos step aside until the shopper clears their picks. We used to prepend
 * the variation's photograph to the product's own gallery, which left the
 * parent's photos sitting beside it in the strip and read, to the people
 * testing it, as "the image didn't change".
 *
 * Hero, thumbnail strip and the zoom overlay all render from this one list, so
 * no surface can lag another.
 */

export interface GalleryImage {
  id: number;
  urlStandard: string;
  urlThumbnail: string | null;
  urlZoom: string | null;
  altText: string | null;
  isThumbnail: boolean | null;
}

/** The id the variation's stand-in row carries — it has no `product_images` row. */
export const VARIANT_IMAGE_ID = -1;

/** Stable identity for a gallery image; the variant stand-in keys on its URL. */
export function galleryImageKey(img: GalleryImage): string {
  return img.id === VARIANT_IMAGE_ID ? `variant:${img.urlStandard}` : `img:${img.id}`;
}

const NO_BROKEN_KEYS: ReadonlySet<string> = new Set<string>();

export function resolveGalleryImages({
  images,
  variantImageUrl,
  productName,
  brokenKeys = NO_BROKEN_KEYS,
}: {
  images: GalleryImage[];
  variantImageUrl: string | null | undefined;
  productName: string;
  /**
   * Images whose FILE turned out not to be there. A dead file is invisible to
   * the server — the row exists and the URL is well formed — so only the
   * browser finds out, and it reports back through here.
   */
  brokenKeys?: ReadonlySet<string>;
}): GalleryImage[] {
  const gallery =
    brokenKeys.size === 0 ? images : images.filter((img) => !brokenKeys.has(galleryImageKey(img)));

  if (!variantImageUrl) return gallery;

  const variantImage: GalleryImage = {
    id: VARIANT_IMAGE_ID,
    urlStandard: variantImageUrl,
    urlThumbnail: variantImageUrl,
    urlZoom: variantImageUrl,
    altText: productName,
    isThumbnail: null,
  };

  // A variation whose picture is dead hands the product's own gallery back,
  // rather than leaving the shopper with an empty stage: replacing the gallery
  // means there is nothing else on screen to fall back to.
  if (brokenKeys.has(galleryImageKey(variantImage))) return gallery;

  return [variantImage];
}

/** True while the gallery is showing a variation rather than the product itself. */
export function isShowingVariant(effectiveImages: GalleryImage[]): boolean {
  return effectiveImages.length === 1 && effectiveImages[0]?.id === VARIANT_IMAGE_ID;
}
