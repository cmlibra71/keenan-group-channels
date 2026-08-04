import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

// ============================================================================
// Anonymous form-upload storage.
//
// A DEDICATED PRIVATE BUCKET, deliberately not the shared assets bucket: that
// one carries a blanket public-read policy for product imagery, and these
// files are customers' receipts, plans and photos. Public access is blocked at
// the bucket level; staff read them through the portal via presigned GETs.
//
// Objects are keyed by an unguessable upload token so one submission's files
// can never be enumerated from another's.
// ============================================================================

export const FORM_UPLOAD_BUCKET = process.env.FORM_UPLOAD_S3_BUCKET || "keenan-form-uploads";
const REGION = process.env.AWS_SES_REGION || process.env.AWS_REGION || "ap-southeast-2";

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

/** Filenames arrive from the internet — strip everything but a safe subset and
 *  cap the length (mirrors the quote-attachment sanitiser). */
export function safeFileName(name: string): string {
  const cleaned = (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return cleaned.replace(/^\.+/, "_") || "file";
}

export function formUploadKey(channelId: number, uploadToken: string, fileName: string): string {
  return `form-uploads/${channelId}/${uploadToken}/${randomUUID()}-${safeFileName(fileName)}`;
}

export async function putFormUpload(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: FORM_UPLOAD_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      // Never inline-render an uploaded file, even if someone obtains a URL.
      ContentDisposition: "attachment",
      ServerSideEncryption: "AES256",
    })
  );
}

/** Human-readable size for the notification email. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
