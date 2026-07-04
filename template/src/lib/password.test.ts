import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { hashPassword, verifyPassword } from "./password.ts";

// password.ts is a thin re-export of @keenan/services verifyStoredPassword /
// hashPasswordForStorage — these tests exercise all three stored-hash formats
// THROUGH the re-export, so a services regression (or a broken alias) fails here.

test("hashes and verifies a password (bcrypt, no rehash needed)", async () => {
  const stored = await hashPassword("s3cret!");
  assert.ok(/^\$2[aby]\$/.test(stored), `expected a bcrypt hash, got: ${stored.slice(0, 8)}…`);
  assert.deepEqual(await verifyPassword("s3cret!", stored), { valid: true, needsRehash: false });
});

test("rejects the wrong password", async () => {
  const stored = await hashPassword("s3cret!");
  assert.deepEqual(await verifyPassword("wrong", stored), { valid: false, needsRehash: false });
});

test("each hash uses a fresh salt (different ciphertext, both verify)", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a, b);
  assert.equal((await verifyPassword("same", a)).valid, true);
  assert.equal((await verifyPassword("same", b)).valid, true);
});

test("empty / missing stored hash never verifies", async () => {
  assert.deepEqual(await verifyPassword("x", null), { valid: false, needsRehash: false });
  assert.deepEqual(await verifyPassword("x", undefined), { valid: false, needsRehash: false });
  assert.deepEqual(await verifyPassword("x", ""), { valid: false, needsRehash: false });
});

test("scrypt$ hashes (this repo's pre-cutover format) verify and flag needsRehash", async () => {
  // Mirror the old lib/password.ts storage format: scrypt$<saltHex>$<hashHex>,
  // keylen 64, N=16384 r=8 p=1.
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync("scryptpw", salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  const stored = `scrypt$${salt}$${derived}`;
  assert.deepEqual(await verifyPassword("scryptpw", stored), { valid: true, needsRehash: true });
  assert.deepEqual(await verifyPassword("nope", stored), { valid: false, needsRehash: false });
});

test("legacy unsalted SHA-256 verifies and flags needsRehash", async () => {
  const legacy = createHash("sha256").update("legacypw").digest("hex");
  assert.deepEqual(await verifyPassword("legacypw", legacy), { valid: true, needsRehash: true });
  assert.deepEqual(await verifyPassword("nope", legacy), { valid: false, needsRehash: false });
});
