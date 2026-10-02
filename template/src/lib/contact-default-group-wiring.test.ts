import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * SOURCE GUARD — every storefront-created contact carries the channel's default customer group
 * (`channel_settings.default_customer_group_id`; Industry Kitchens: Mates Rates, Zoey's default for
 * new customers). Without it a signed-in trade registration is priced as a guest once customer-group
 * pricing is on (judge B2). Both inserts must read the setting; NULL where the channel sets none.
 */
const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

for (const file of ["lib/contact-auth.ts", "lib/checkout/guest-contact.ts"]) {
  test(`${file}: the contact INSERT stamps the channel's default customer group`, () => {
    const src = read(file);
    const insert = src.slice(src.indexOf("INSERT INTO contacts"));
    assert.match(insert, /customer_group_id\s*\)\s*VALUES/);
    assert.match(insert, /setting_key = 'default_customer_group_id'/);
    // Numeric-guarded: a malformed setting stamps NULL instead of failing the registration.
    assert.match(insert, /~ '\^\[0-9\]\+\$'/);
  });
}
