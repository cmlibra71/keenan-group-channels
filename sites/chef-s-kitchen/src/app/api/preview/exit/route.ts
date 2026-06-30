import { NextRequest, NextResponse } from "next/server";
import { draftMode } from "next/headers";

/** Leave CMS draft preview mode. */
export async function GET(req: NextRequest) {
  (await draftMode()).disable();
  const to = req.nextUrl.searchParams.get("redirect") || "/";
  return NextResponse.redirect(new URL(to, req.nextUrl.origin));
}
