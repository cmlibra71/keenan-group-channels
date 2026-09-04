import { NextRequest, NextResponse } from "next/server";
import { cmsFormService, cmsFormSubmissionFileService } from "@keenan/services/services";
import { declaredUploadType, isAcceptableUpload, recordAudit } from "@keenan/services";
import { checkUploadAllowed } from "@keenan/services/upload-guard";
import { INFECTED_REFUSAL, describeScan, scanUpload } from "@keenan/services/upload-scan";
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

  // A refused or unscanned upload is written to `audit_log`, exactly as the
  // portal's staff seam writes one (card UFprd4ED). "Somebody tried to send us
  // something we would not take" is the event a security question is answered
  // from later, and a line in a container's stdout is not an answer — it is gone
  // at the next deploy. The row carries no actor because there is none: this is
  // an anonymous visitor, so the IP is what identifies them, the same way the
  // storefront's rate limiter records one.
  const audit = (action: string, extra: Record<string, unknown>) =>
    recordAudit(
      {
        action,
        entityType: "uploads",
        newValues: {
          surface: "storefront-form-upload",
          channel_id: CHANNEL_ID,
          form_key: formKey,
          field_name: fieldName,
          file_name: file.name,
          declared_type: file.type || null,
          resolved_type: declaredType,
          size_bytes: bytes.byteLength,
          ...extra,
        },
      },
      { ipAddress: ip }
    ).catch(() => {});

  // The shared allow-list (card UFprd4ED) — the same one the portal's staff
  // uploads check, so "what may be uploaded" has ONE answer across the business.
  // It also refuses by EXTENSION, which the byte check below cannot: a file
  // called `plan.exe` sent as application/pdf carries real PDF bytes and passes
  // a magic-byte test.
  const allowed = checkUploadAllowed({
    fileName: file.name,
    declaredType,
    size: bytes.byteLength,
    maxBytes,
    policy: "public-form",
  });
  if (!allowed.ok) {
    await audit("upload.refused", { refused_because: allowed.code, message: allowed.reason });
    return fail(415, allowed.reason);
  }

  const verdict = isAcceptableUpload(declaredType, new Uint8Array(bytes.subarray(0, 32)));
  if (!verdict.ok) {
    await audit("upload.refused", { refused_because: "content", message: verdict.reason ?? null });
    return fail(415, verdict.reason ?? "That file type isn't accepted.");
  }

  // Virus scan, BEFORE the bytes are stored — this is the one upload path in the
  // business that holds the file itself, so it is the one that can scan first.
  // Shipped OFF (UPLOAD_VIRUS_SCAN unset), and it FAILS OPEN: a scanner that is
  // down must never be the reason a customer cannot send us an enquiry, so an
  // unreachable clamd logs a line and the file goes through.
  const scan = await scanUpload(bytes);
  if (scan.status === "infected") {
    console.warn("[forms/upload] refused:", describeScan(scan), file.name);
    await audit("upload.infected", { signature: scan.signature, scanner: scan.scanner });
    return fail(415, INFECTED_REFUSAL);
  }
  if (scan.status === "unavailable") {
    console.warn("[forms/upload] stored unscanned:", describeScan(scan), file.name);
    await audit("upload.unscanned", { reason: describeScan(scan) });
  }

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
