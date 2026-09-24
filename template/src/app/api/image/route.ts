import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import {
  createSourceProbeMemo,
  probeSource,
  serveOptimizedImage,
} from "@keenan/services/utils";
import { isFetchableImageUrl } from "@/lib/image-origin";
import { normaliseWidth, normaliseQuality } from "@/lib/image-params";

const S3_BUCKET = process.env.IMAGE_CACHE_S3_BUCKET || "keenan-group-images";
const S3_REGION = process.env.IMAGE_CACHE_S3_REGION || "ap-southeast-2";
const s3 = new S3Client({ region: S3_REGION });

/**
 * One HEAD of the original per minute per process tells us its VERSION (cards stH1U00j + L1gFfhko):
 * the resized copy is keyed on it, so a photo replaced under the same URL (the Zoey ingest always
 * writes `products/<id>/<index>.jpg`) is re-resized instead of serving the first copy ever made.
 * Every rule about WHICH bytes a shopper gets lives in `@keenan/services/utils` `serveOptimizedImage`
 * (unit-tested there); this route only supplies S3, fetch and sharp.
 */
const probes = createSourceProbeMemo({ probe: (u) => probeSource(u), ttlMs: 60_000, max: 5000 });

/** Stored copies ARE immutable: their key carries the original's version. */
const STORED_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get("url");
  // Snapped to a fixed set, NOT merely clamped: every distinct (w, q) pair is a
  // sharp encode plus an S3 PUT, so an open range is a cost-amplification lever.
  const width = normaliseWidth(searchParams.get("w"));
  const quality = normaliseQuality(searchParams.get("q"));

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // SSRF guard: only fetch https images from an allowlisted bucket — our own two wholesale, plus
  // Zoey's shared media bucket UNDER our own site's product-media prefix only — or a file THIS
  // site serves itself, `/api/**` excepted (see image-origin.ts). The version probe (a HEAD) goes
  // to the same allowlisted URL and, like the GET, never follows a redirect.
  if (!isFetchableImageUrl(url)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const result = await serveOptimizedImage(
    { url, width, quality, ifNoneMatch: request.headers.get("if-none-match") },
    {
      probe: (u) => probes.get(u),
      lastKnown: (u) => probes.lastKnown(u),
      async getCached(key) {
        try {
          const cached = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
          if (!cached.Body) return null;
          return {
            body: await cached.Body.transformToByteArray(),
            lastModified: cached.LastModified ?? null,
          };
        } catch {
          return null; // cache miss
        }
      },
      putCached(key, body) {
        s3.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: body,
            ContentType: "image/webp",
            CacheControl: STORED_CACHE_CONTROL,
          })
        ).catch((err) => {
          console.error("[image-optimizer] S3 cache write failed:", err.message);
        });
      },
      copyCached(fromKey, toKey) {
        // Server-side copy of a legacy copy PROVEN newer than its original, so it becomes a plain
        // hit next time without being re-encoded.
        s3.send(
          new CopyObjectCommand({
            Bucket: S3_BUCKET,
            Key: toKey,
            CopySource: `${S3_BUCKET}/${fromKey}`,
            MetadataDirective: "REPLACE",
            ContentType: "image/webp",
            CacheControl: STORED_CACHE_CONTROL,
          })
        ).catch((err) => {
          console.error("[image-optimizer] S3 cache copy failed:", err.message);
        });
      },
      async fetchOriginal(u) {
        // Do NOT follow redirects: an allowlisted origin could 30x to an internal /
        // unlisted host, defeating the SSRF allowlist above. undici surfaces a manual
        // redirect as an "opaqueredirect" response (status 0); other runtimes expose
        // the 30x status directly — refuse both.
        const res = await fetch(u, { redirect: "manual" });
        if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
          return { ok: false, status: 502 };
        }
        if (!res.ok) return { ok: false, status: res.status };
        return { ok: true, body: Buffer.from(await res.arrayBuffer()), headers: res.headers };
      },
      render(original, w, q) {
        return sharp(original).resize(w, undefined, { fit: "inside" }).webp({ quality: q }).toBuffer();
      },
    }
  );

  if (result.status === 304) {
    return new NextResponse(null, { status: 304, headers: result.headers });
  }
  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return new NextResponse(Buffer.from(result.body) as unknown as BodyInit, {
    status: 200,
    headers: result.headers,
  });
}
