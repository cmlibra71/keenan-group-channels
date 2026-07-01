import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "./password.ts";

test("hashes and verifies a password (scrypt, no rehash needed)", async () => {
  const stored = await hashPassword("s3cret!");
  assert.ok(stored.startsWith("scrypt$"));
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

test("legacy unsalted SHA-256 verifies and flags needsRehash", async () => {
  const legacy = createHash("sha256").update("legacypw").digest("hex");
  assert.deepEqual(await verifyPassword("legacypw", legacy), { valid: true, needsRehash: true });
  assert.deepEqual(await verifyPassword("nope", legacy), { valid: false, needsRehash: false });
});
