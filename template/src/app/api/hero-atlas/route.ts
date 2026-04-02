import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getProducts } from "@/lib/store";

const S3_BUCKET = process.env.IMAGE_CACHE_S3_BUCKET || "keenan-group-images";
const S3_REGION = process.env.IMAGE_CACHE_S3_REGION || "ap-southeast-2";
const CHANNEL_ID = process.env.CHANNEL_ID || "1";

const ATLAS_SIZE = 1024;
const GRID = 5; // 5x5 = 25 slots
const CELL_SIZE = Math.floor(ATLAS_SIZE / GRID);

const s3 = new S3Client({ region: S3_REGION });

function getCacheKey(imageUrls: string[]): string {
  const hash = crypto
    .createHash("sha256")
    .update(imageUrls.sort().join("|"))
    .digest("hex")
    .slice(0, 16);
  return `hero-atlas/channel-${CHANNEL_ID}/${hash}.webp`;
}

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  "Content-Type": "image/webp",
};

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  // 1. Fetch featured product image URLs
  const { products } = await getProducts({ featured: true, limit: 25 });
  const imageUrls = products
    .map((p: { thumbnailImage?: { urlStandard: string } | null }) =>
      p.thumbnailImage?.urlStandard
    )
    .filter((url: string | undefined): url is string => Boolean(url))
    .slice(0, GRID * GRID);

  if (imageUrls.length === 0) {
    return NextResponse.json({ error: "No product images available" }, { status: 404 });
  }

  const cacheKey = getCacheKey(imageUrls);

  // 2. Check S3 cache (skip if refresh requested)
  if (!refresh) {
    try {
      const cached = await s3.send(
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: cacheKey })
      );
      if (cached.Body) {
        const bytes = await cached.Body.transformToByteArray();
        return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
          status: 200,
          headers: CACHE_HEADERS,
        });
      }
    } catch {
      // Cache miss — generate below
    }
  }

  // 3. Fetch all product images in parallel
  const imageBuffers = await Promise.all(
    imageUrls.map(async (url: string): Promise<Buffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      } catch {
        return null;
      }
    })
  );

  // 4. Composite into atlas with sharp
  // Start with a dark gray background
  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const buf = imageBuffers[i];
    if (!buf) continue;

    const col = i % GRID;
    const row = Math.floor(i / GRID);

    try {
      // Resize each image to fit the cell, covering it
      const resized = await sharp(buf)
        .resize(CELL_SIZE, CELL_SIZE, { fit: "cover" })
        .toBuffer();

      composites.push({
        input: resized,
        left: col * CELL_SIZE,
        top: row * CELL_SIZE,
      });
    } catch {
      // Skip bad images — cell stays dark gray
    }
  }

  let atlas: Buffer;
  try {
    atlas = await sharp({
      create: {
        width: ATLAS_SIZE,
        height: ATLAS_SIZE,
        channels: 3,
        background: { r: 39, g: 39, b: 42 }, // zinc-800
      },
    })
      .composite(composites)
      .webp({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.error("[hero-atlas] Composite failed:", err);
    return NextResponse.json({ error: "Atlas generation failed" }, { status: 500 });
  }

  // 5. Upload to S3 (fire-and-forget)
  s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: cacheKey,
      Body: atlas,
      ContentType: "image/webp",
      CacheControl: "public, max-age=86400",
    })
  ).catch((err) => {
    console.error("[hero-atlas] S3 cache write failed:", err.message);
  });

  // 6. Return atlas
  return new NextResponse(atlas as unknown as BodyInit, {
    status: 200,
    headers: CACHE_HEADERS,
  });
}
