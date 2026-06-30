import { NextRequest, NextResponse } from "next/server";
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPreviewToken } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/channel";

/**
 * Enter Next draft mode for a CMS preview. The portal mints a short-lived signed
 * token (CMS_PREVIEW_SECRET, shared) for {channelId, pageKey}; we verify it,
 * confirm it's for THIS channel, enable draft mode, and redirect to the page.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CMS_PREVIEW_SECRET;
  const token = req.nextUrl.searchParams.get("token");
  const claims = verifyPreviewToken(token, secret ?? "");
  if (!claims) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  if (claims.channelId !== CHANNEL_ID) {
    return NextResponse.json({ error: "Wrong channel" }, { status: 403 });
  }

  (await draftMode()).enable();
  redirect(pathForPageKey(claims.pageKey));
}

function pathForPageKey(pageKey: string): string {
  if (pageKey === "home") return "/";
  if (pageKey === "blog_index") return "/blog";
  if (pageKey.startsWith("page:")) return `/pages/${pageKey.slice("page:".length)}`;
  if (pageKey.startsWith("category:")) {
    // category previews land on the category index; the slug isn't in the key.
    return "/categories";
  }
  return "/";
}
