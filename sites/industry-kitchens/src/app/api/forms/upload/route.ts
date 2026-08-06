import { NextRequest, NextResponse } from "next/server";
import { cmsFormService, cmsFormSubmissionFileService } from "@keenan/services/services";
import { declaredUploadType, isAcceptableUpload } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/channel";
import { slidingWindowAllow } from "@/lib/rate-limit";
import { formUploadKey, putFormUpload, sizeLabel } from "@/lib/form-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ============================================================================
// Anonymous attachment upload for builder forms.
//
// This PROXIES the bytes rather than handing out a presigned PUT. A presigned
// URL can pin the key and content-type but CANNOT cap size — giving one to an
// anonymous visitor is an uncapped write into our bucket. Proxying gives a
// single choke point that counts real bytes (not a claimed Content-Length),
// sniffs magic bytes, rate-limits per IP and per token, and writes the DB row
// in the same request.
//
// Files are uploaded BEFORE the form is submitted and claimed by token at
// submit time, so an abandoned upload leaves a sweepable orphan rather than a
// half-formed enquiry in the staff list.
// ============================================================================

const TOKEN_RE = /^[0-9a-f-]{36}$/i;
const ABSOLUTE_MAX_BYTES = 10 * 1024 * 1024;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "").trim() || "unknown";
}

const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status });

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Cheap rejections first, before we read a single byte of the body.
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength && declaredLength > ABSOLUTE_MAX_BYTES + 8192)
    return fail(413, "That file is too large.");
  if (!slidingWindowAllow(`form-upload-ip:${ip}`, { windowMs: 60_000, max: 10 }))
    return fail(429, "Too many uploads — please wait a moment.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // The platform caps the request body at 10MB, so a file AT the advertised
    // limit fails to parse rather than arriving — the size check below never
    // gets to run. Without this, the one visitor who picks a 10MB file is told
    // "Malformed upload", which they can do nothing with. Tell them the real
    // reason, in the same words the explicit cap uses.
    if (declaredLength > ABSOLUTE_MAX_BYTES - 8192)
      return fail(413, `Files must be under ${sizeLabel(ABSOLUTE_MAX_BYTES)}.`);
    return fail(400, "Malformed upload.");
  }

  const formKey = String(form.get("formKey") ?? "");
  const uploadToken = String(form.get("uploadToken") ?? "");
  const fieldName = form.get("fieldName") ? String(form.get("fieldName")) : null;
  const file = form.get("file");

  if (!TOKEN_RE.test(uploadToken)) return fail(400, "Invalid upload session.");
  if (!slidingWindowAllow(`form-upload-tok:${uploadToken}`, { windowMs: 3_600_000, max: 20 }))
    return fail(429, "Too many uploads for this form.");
  if (!(file instanceof File) || file.size === 0) return fail(400, "No file received.");

  // The form must exist on THIS channel and actually accept files.
  const def = (await cmsFormService.getByKeyForChannel(formKey, CHANNEL_ID).catch(() => null)) as
    | { id: number; allow_files?: boolean; max_files?: number; max_file_bytes?: number }
    | null;
  if (!def) return fail(404, "Unknown form.");
  if (!def.allow_files) return fail(400, "This form doesn't accept attachments.");

  const maxBytes = Math.min(def.max_file_bytes ?? ABSOLUTE_MAX_BYTES, ABSOLUTE_MAX_BYTES);
  if (file.size > maxBytes) return fail(413, `Files must be under ${sizeLabel(maxBytes)}.`);

  const already = await cmsFormSubmissionFileService.countForToken(uploadToken).catch(() => 0);
  if (already >= (def.max_files ?? 5))
    return fail(429, `You can attach at most ${def.max_files ?? 5} files.`);

  // Real byte count — never trust the declared length.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > maxBytes) return fail(413, `Files must be under ${sizeLabel(maxBytes)}.`);

  // The declared type and the extension are both attacker-controlled; the
  // leading bytes must corroborate them. The browser's own hint is missing
  // altogether for some legitimate files (Chrome on Windows sends no type at
  // all for .heic), so fall back to the filename — the bytes still decide.
  const declaredType = declaredUploadType(file.name, file.type);
  const verdict = isAcceptableUpload(declaredType, new Uint8Array(bytes.subarray(0, 32)));
  if (!verdict.ok) return fail(415, verdict.reason ?? "That file type isn't accepted.");

  const key = formUploadKey(CHANNEL_ID, uploadToken, file.name);
  try {
    await putFormUpload({ key, body: bytes, contentType: declaredType });
  } catch (e) {
    console.error("[forms/upload] S3 put failed:", e instanceof Error ? e.message : e);
    return fail(502, "Upload failed — please try again.");
  }

  try {
    const row = (await cmsFormSubmissionFileService.registerUpload({
      uploadToken,
      channelId: CHANNEL_ID,
      formId: def.id,
      fieldName,
      fileName: file.name,
      s3Key: key,
      contentType: declaredType,
      fileSize: bytes.byteLength,
      ipAddress: ip,
    })) as { id: number };
    // Deliberately no key/URL in the response — the browser never needs it.
    return NextResponse.json({
      success: true,
      fileId: row.id,
      fileName: file.name,
      sizeLabel: sizeLabel(bytes.byteLength),
    });
  } catch (e) {
    console.error("[forms/upload] register failed:", e instanceof Error ? e.message : e);
    return fail(500, "Upload failed — please try again.");
  }
}
