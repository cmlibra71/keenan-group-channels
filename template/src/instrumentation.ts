/**
 * Next's one boot hook, run once per server process.
 *
 * All it does today is start the drain that turns the middleware guard's
 * queued rate-limit trips into audit rows (lib/security/guard-audit.ts). The
 * guard itself cannot write them: its bundle may not import @keenan/services.
 */
export async function register(): Promise<void> {
  // The edge build of instrumentation runs too, and has no data layer.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startGuardAuditDrain } = await import("@/lib/security/guard-audit");
  startGuardAuditDrain();
}
