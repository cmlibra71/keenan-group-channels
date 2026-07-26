// ============================================================================
// Password hashing/verification — thin re-export of the ONE shared
// implementation in @keenan/services (identity unification).
//
// Contacts carry password hashes in three coexisting formats (copied VERBATIM
// from the legacy customers rows during the migration):
//   - bcrypt      `$2a$/$2b$/$2y$…`   — the storage format going forward
//   - scrypt      `scrypt$<salt>$<hash>` — this repo's pre-cutover format
//   - legacy      64-hex unsalted SHA-256 — Zoey-era imports
//
// verifyStoredPassword multiplexes all three and reports needsRehash=true for
// the non-bcrypt formats so login flows transparently upgrade the hash.
// hashPasswordForStorage produces bcrypt (cost 12).
//
// The old local names (hashPassword / verifyPassword) are kept as aliases so
// existing call sites and tests keep compiling; new code may import either.
// ============================================================================

import { verifyStoredPassword, hashPasswordForStorage } from "@keenan/services";

export { verifyStoredPassword, hashPasswordForStorage };

/** Hash a password for storage (bcrypt via @keenan/services). */
export const hashPassword = hashPasswordForStorage;

/**
 * Verify a password against a stored hash (bcrypt / scrypt$ / legacy sha256).
 * `needsRehash` is true when the stored hash is not bcrypt, so the caller can
 * transparently upgrade it on a successful login.
 */
export const verifyPassword = verifyStoredPassword;

/**
 * Enforce password strength on every path that SETS a password (register /
 * reset / change). Rule: at least 8 characters, at least one capital letter,
 * and at least one special (non-alphanumeric) character. Returns an error
 * message when the password is too weak, or `null` when it passes.
 *
 * The rule itself now lives in @keenan/services (src/auth/password-policy.ts)
 * so the storefronts and the portal (staff sign-up, the back-office
 * set-customer-password dialog, the Commerce REST contact routes) all enforce
 * ONE definition. `@keenan/services/password-policy` is a pure, import-free
 * leaf, so it is safe in client components too. Re-exported here so existing
 * `@/lib/password` imports keep working.
 */
export { validatePasswordStrength, PASSWORD_POLICY_HINT } from "@keenan/services/password-policy";
