import { scrypt, randomBytes, timingSafeEqual, createHash, type ScryptOptions } from "node:crypto";

// Hand-rolled promise wrapper: util.promisify's emitted overload for scrypt drops
// the optional `options` arg, so passing work-factor PARAMS tripped "expected 3 args".
const scryptAsync = (password: string, salt: string, keylen: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, options, (err, derivedKey) => (err ? reject(err) : resolve(derivedKey)))
  );

// Salted, work-factored scrypt. Stored as `scrypt$<saltHex>$<hashHex>`.
const PREFIX = "scrypt$";
const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** Hash a password for storage (scrypt + random per-user salt). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEYLEN, PARAMS)) as Buffer;
  return `${PREFIX}${salt}$${derived.toString("hex")}`;
}

/** Legacy hash format produced by the old unsalted SHA-256 (hex digest). */
function legacySha256(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function safeEqualHex(aHex: string, bHex: string): boolean {
  let a: Buffer, b: Buffer;
  try {
    a = Buffer.from(aHex, "hex");
    b = Buffer.from(bHex, "hex");
  } catch {
    return false;
  }
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Verify a password against a stored hash. Supports the new scrypt format and
 * the legacy unsalted SHA-256 (64 hex chars). When a legacy hash verifies,
 * `needsRehash` is true so the caller can transparently upgrade it on login.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!stored) return { valid: false, needsRehash: false };

  if (stored.startsWith(PREFIX)) {
    const [, salt, hashHex] = stored.split("$");
    if (!salt || !hashHex) return { valid: false, needsRehash: false };
    const derived = (await scryptAsync(password, salt, KEYLEN, PARAMS)) as Buffer;
    return { valid: safeEqualHex(derived.toString("hex"), hashHex), needsRehash: false };
  }

  // Legacy unsalted SHA-256.
  const valid = safeEqualHex(legacySha256(password), stored);
  return { valid, needsRehash: valid };
}
