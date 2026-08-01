import { NextRequest, NextResponse } from "next/server";

// `commit` is baked into the image at build time (Dockerfile.site ARG GIT_SHA,
// fed from github.sha). The blue-green deploy script polls this on the NEW
// container's direct port to confirm it is serving the expected build before
// flipping traffic — during a swap the old container keeps answering 200, so
// status alone proves nothing.
// Never prerender: a statically-optimised health route would freeze the
// timestamp and could bake in build-stage env.
export const dynamic = "force-dynamic";

// ?deep=1 adds a readiness probe (one SELECT 1 against the commerce DB) so a
// container with a bad COMMERCE_DATABASE_URL can never take traffic. The plain
// call stays a pure liveness check.
export async function GET(request: NextRequest) {
  const base = {
    commit: process.env.GIT_SHA ?? "unknown",
    timestamp: new Date().toISOString(),
  };

  if (request.nextUrl.searchParams.get("deep") === "1") {
    try {
      const [{ getCommerceDb }, { sql }] = await Promise.all([
        import("@keenan/services"),
        import("drizzle-orm"),
      ]);
      await Promise.race([
        getCommerceDb().execute(sql`SELECT 1`),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("db check timed out after 3000ms")), 3000)
        ),
      ]);
    } catch (err) {
      return NextResponse.json(
        {
          status: "degraded",
          ...base,
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ status: "ok", ...base });
}
