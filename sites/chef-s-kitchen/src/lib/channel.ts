// Fail-closed channel id. Every storefront process is bound to exactly one
// channel; running without CHANNEL_ID set would silently serve channel 1's
// data (and accept its sessions), so we refuse to start instead — mirroring the
// SESSION_SECRET guard in auth.ts. This is the single source of truth for the
// channel id across the store factory, auth, and the API routes.
function resolveChannelId(): number {
  const raw = process.env.CHANNEL_ID;
  if (!raw) throw new Error("CHANNEL_ID env var is required");
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    throw new Error(`CHANNEL_ID must be a number, got "${raw}"`);
  }
  return id;
}

export const CHANNEL_ID = resolveChannelId();
