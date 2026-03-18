import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getCacheKey } from "@keenan/services/utils";

const S3_BUCKET = process.env.IMAGE_CACHE_S3_BUCKET || "keenan-group-images";
const S3_REGION = process.env.IMAGE_CACHE_S3_REGION || "ap-southeast-2";
const ALLOWED_ORIGIN = "keenan-group-images.s3.ap-southeast-2.amazonaws.com";

const s3 = new S3Client({ region: S3_REGION });

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get("url");
  const width = Math.min(parseInt(searchParams.get("w") || "800", 10), 3840);
  const quality = Math.min(parseInt(searchParams.get("q") || "80", 10), 100);

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Only allow images from our S3 bucket
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== ALLOWED_ORIGIN) {
      return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const cacheKey = getCacheKey(url, width, quality);
  const cacheHeaders = {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "image/webp",
  };

  // 1. Check S3 cache
  try {
    const cached = await s3.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: cacheKey })
    );
    if (cached.Body) {
      const bytes = await cached.Body.transformToByteArray();
      return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, { status: 200, headers: cacheHeaders });
    }
  } catch {
    // Cache miss — continue to optimize
  }

  // 2. Fetch original image
  let originalBuffer: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch original image" }, { status: 502 });
    }
    originalBuffer = Buffer.from(await res.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Failed to fetch original image" }, { status: 502 });
  }

  // 3. Resize and convert to WebP
  let optimized: Buffer;
  try {
    optimized = await sharp(originalBuffer)
      .resize(width, undefined, { fit: "inside" })
      .webp({ quality })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  }

  // 4. Upload to S3 cache (fire-and-forget)
  s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: cacheKey,
      Body: optimized,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    })
  ).catch((err) => {
    console.error("[image-optimizer] S3 cache write failed:", err.message);
  });

  // 5. Return optimized image
  return new NextResponse(optimized as unknown as BodyInit, { status: 200, headers: cacheHeaders });
}
