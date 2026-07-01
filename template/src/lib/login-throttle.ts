// Basic in-memory login throttle (per container). Not a substitute for a shared
// store across replicas, but it blunts online brute-forcing of a single node.
//
// Shared by EVERY credential-verification entry point (the sign-in form action and
// the account-panel login) so they use ONE keyspace — an attacker can't dodge the
// limit by alternating between the two paths.
const attempts = new Map<string, number[]>();
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;

export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const recent = attempts.get(key) || [];
  recent.push(Date.now());
  attempts.set(key, recent);
  if (attempts.size > 5000) attempts.clear(); // crude bound
}
