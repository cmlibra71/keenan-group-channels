// Pixel-diff two screenshots and write a highlighted diff image.
//
// Two deliberate choices:
//
//  * Height mismatch is a FAILURE, not something to pad around. If the node
//    version is 40px taller, that IS the regression — silently cropping to the
//    shorter one would hide exactly what we're looking for. We diff the shared
//    region so the image still shows where things drifted, and report the
//    mismatch separately so it can't be scored away.
//
//  * The threshold is on the FRACTION of differing pixels, not an absolute
//    count, so a long page isn't held to a stricter standard than a short one.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/** Per-pixel colour sensitivity. Lower = fussier. 0.1 tolerates antialiasing. */
const PIXEL_THRESHOLD = 0.1;

export async function compare(aPath, bPath, diffPath, { threshold = 0.001 } = {}) {
  const [aBuf, bBuf] = await Promise.all([readFile(aPath), readFile(bPath)]);
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);

  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const sizeMismatch = a.width !== b.width || a.height !== b.height;

  // Crop both to the shared region so pixelmatch can run at all.
  const crop = (src) => {
    if (src.width === width && src.height === height) return src;
    const out = new PNG({ width, height });
    PNG.bitblt(src, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const ca = crop(a);
  const cb = crop(b);

  const diff = new PNG({ width, height });
  const differing = pixelmatch(ca.data, cb.data, diff.data, width, height, {
    threshold: PIXEL_THRESHOLD,
    includeAA: false,
    alpha: 0.2,
    diffColor: [255, 0, 0],
  });

  await mkdir(dirname(diffPath), { recursive: true });
  await writeFile(diffPath, PNG.sync.write(diff));

  const total = width * height;
  const ratio = total ? differing / total : 0;
  return {
    differing,
    total,
    ratio,
    percent: +(ratio * 100).toFixed(4),
    sizeMismatch,
    dimensions: { a: [a.width, a.height], b: [b.width, b.height] },
    // A size mismatch is a fail regardless of how few pixels differ inside the
    // region they happen to share.
    pass: ratio <= threshold && !sizeMismatch,
    threshold,
  };
}
