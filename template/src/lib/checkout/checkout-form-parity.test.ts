import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE FILES `sync:check` CANNOT GUARD (cards twwZMnMY, Xw9VQmAJ).
 *
 * `components/checkout/CheckoutForm.tsx` and `app/checkout/page.tsx` are deliberately NOT in
 * `orchestrator/shared-modules.json`: they carry per-site design tokens and per-site page wiring,
 * so they may legitimately diverge and `check-shared-sync.mjs` skips them. Their BEHAVIOUR must
 * not diverge, and `Dockerfile.site` builds from `sites/${SITE_NAME}/` — `template/` is never
 * built — so a behaviour change applied to template only still compiles, still passes every other
 * test, and ships the OLD checkout to the shopper.
 *
 * That is not hypothetical: card Xw9VQmAJ changed the delivery quote to ask on the address's
 * residential/commercial classification in template only. Both site copies kept posting
 * `{ postcode, subtotal }`, so the summary would have quoted without the surcharge that
 * `placeOrder` charged — the show-does-not-equal-charge fault the whole rule exists to stop.
 *
 * So this test pins the load-bearing LINES rather than the whole file: every tree must contain
 * each of them. Add a line here when you add behaviour to either file; never relax one to make a
 * site pass.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const TREES = ["template", "sites/chef-s-kitchen", "sites/industry-kitchens"];

const REQUIRED: Array<{ file: string; needles: string[] }> = [
  {
    file: "src/components/checkout/CheckoutForm.tsx",
    needles: [
      // The delivery quote is asked WITH the address classification...
      "address_type: (addressTypeHint ?? addressTypeRef.current) || undefined",
      // ...which is the one value the hidden field posts, so show equals charge.
      "const effectiveAddressType =",
      'name="address_type" value={effectiveAddressType}',
      // A Places pick quotes on ITS OWN classification, not the render-behind ref.
      'calculateShippingCost(place.postalCode, place.addressType ?? "")',
    ],
  },
  {
    file: "src/app/checkout/page.tsx",
    // A saved address carries its own classification through to the form — QUARANTINED, because
    // `customer_addresses.address_type` is DEFAULT 'residential' on all 15,518 production rows.
    needles: ['addressType: addressTypeFromContactBook(a.address_type ?? a.addressType) ?? "",'],
  },
];

for (const { file, needles } of REQUIRED) {
  for (const needle of needles) {
    test(`${file} carries "${needle.slice(0, 48)}…" in every tree`, () => {
      for (const tree of TREES) {
        const src = readFileSync(join(ROOT, tree, file), "utf8");
        assert.ok(
          src.includes(needle),
          `${tree}/${file} is missing:\n  ${needle}\n` +
            "Hand-apply the change to every tree — sites/ is what Dockerfile.site builds."
        );
      }
    });
  }
}

test("both site copies post an address_type on the SAVED-address path too", () => {
  // Selecting a saved address used to post no `address_type` at all, which lost the residential
  // stamp on the order and would have let the summary quote a surcharge the charge never included.
  for (const tree of TREES) {
    const src = readFileSync(join(ROOT, tree, "src/components/checkout/CheckoutForm.tsx"), "utf8");
    const hidden = src.match(/name="address_type"/g) ?? [];
    assert.equal(hidden.length, 2, `${tree}: expected the typed-address AND saved-address hidden fields`);
  }
});
