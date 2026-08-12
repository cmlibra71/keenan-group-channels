import "server-only";
import { drainGuardEvents } from "@/lib/guard/events";

/**
 * The app-side half of the middleware guard's audit trail.
 *
 * The guard runs in the middleware bundle, which may not import
 * @keenan/services (see lib/guard/index.ts), so it cannot write an audit row —
 * it queues the trip on a process-wide queue instead (lib/guard/events.ts).
 * This module drains that queue and writes ONE `security.rate_limited` row per
 * event, so a 429 the shopper actually received is on the record in the same
 * place, and with the same action name, as the per-account trips written by
 * ./rate-limits.ts.
 *
 * Started once per server from instrumentation.ts.
 */

const FLUSH_MS = 15_000;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Write everything queued. Returns how many rows it wrote — the seam the test
 * and any manual check use.
 *
 * The heavy imports are deliberately INSIDE the function and behind the empty
 * check: a quiet storefront never pays for the data layer here, and boot never
 * opens a connection on this path.
 */
export async function flushGuardEvents(): Promise<number> {
  const events = drainGuardEvents();
  if (events.length === 0) return 0;

  try {
    const { recordAudit } = await import("@keenan/services");
    const { CHANNEL_ID } = await import("@/lib/store");

    for (const event of events) {
      await recordAudit(
        {
          action: "security.rate_limited",
          entityType: "security",
          newValues: {
            policy: `guard.${event.policy}`,
            scope: "ip",
            retry_after_seconds: event.retryAfterSec,
            path: event.path,
            surface: "storefront.middleware",
            enforced: event.enforced,
            channel_id: CHANNEL_ID,
          },
        },
        { ipAddress: event.ipKey, email: null }
      );
    }
  } catch (err) {
    // An audit write must never take the storefront with it.
    console.error("[guard-audit] flush failed:", err);
  }

  return events.length;
}

/** Idempotent: repeated calls (dev HMR, double register) start one timer. */
export function startGuardAuditDrain(): void {
  if (timer) return;
  timer = setInterval(() => {
    void flushGuardEvents();
  }, FLUSH_MS);
  // Never hold the process open — a draining container must still exit.
  timer.unref?.();
}
