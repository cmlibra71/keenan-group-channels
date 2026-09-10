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
      // Every Order Summary line carries its product photograph (card qjV98YEK): the prop the
      // page fills, the branch that draws it, the placeholder a product with no usable picture
      // falls back to, and the containment that stops a 48px square cropping a bench in half.
      // Design tokens are deliberately NOT pinned — those are exactly what these two files are
      // allowed to diverge on.
      "image_url?: string | null;",
      "{item.image_url ? (",
      '<Package className="h-5 w-5" />',
      'className="object-contain p-1"',
    ],
  },
  {
    file: "src/app/checkout/page.tsx",
    needles: [
      // A saved address carries its own classification through to the form — QUARANTINED, because
      // `customer_addresses.address_type` is DEFAULT 'residential' on all 15,518 production rows.
      'addressType: addressTypeFromContactBook(a.address_type ?? a.addressType) ?? "",',
      // The Order Summary photographs are resolved server-side in ONE batched, never-throw read
      // and handed to the form on the line (card qjV98YEK). A site left on `items={cart.items}`
      // still compiles and still passes every other test, and Dockerfile.site would ship that
      // site a summary with no pictures while template's looked right.
      'import { orderSummaryImagesForProducts } from "@/lib/checkout/order-summary-images";',
      "const summaryImages = await orderSummaryImagesForProducts(",
      "image_url: summaryImages.get(Number(i.product_id)) ?? null,",
      "items={summaryItems}",
    ],
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

test("the Order Summary photograph never displaces what the line SAYS", () => {
  // Card qjV98YEK put the picture in its own column. Everything the line says — the name and
  // price row, the add-on configuration (card kyMjCmAw) and the back-order note — has to stay
  // together in the TEXT column beside it, at full paragraph width. That note is the only
  // explanation of a back order a shopper gets anywhere now that card CXnP1lrL removed every
  // other availability string (card 7vu2iEEZ, Tim 2026-08-11), so a re-layout that pushes it
  // out of the column, or drops it to make room for the thumbnail, is the failure this pins.
  for (const tree of TREES) {
    const src = readFileSync(join(ROOT, tree, "src/components/checkout/CheckoutForm.tsx"), "utf8");
    const image = src.indexOf("{item.image_url ? (");
    assert.ok(image > 0, `${tree}: the Order Summary line no longer renders a product photograph`);

    const textColumn = src.indexOf("min-w-0 flex-1", image);
    assert.ok(
      textColumn > image,
      `${tree}: the picture is not followed by a text column — the summary line has been re-laid out`
    );

    for (const inside of ["{configuration && (", "{backorderNote && (", "<Price amount="]) {
      const at = src.indexOf(inside, textColumn);
      assert.ok(
        at > textColumn,
        `${tree}: ${inside} no longer sits inside the Order Summary's text column.\n` +
          "The image column may never displace the price, the configuration or the back-order note."
      );
    }
  }
});

test("both site copies post an address_type on the SAVED-address path too", () => {
  // Selecting a saved address used to post no `address_type` at all, which lost the residential
  // stamp on the order and would have let the summary quote a surcharge the charge never included.
  for (const tree of TREES) {
    const src = readFileSync(join(ROOT, tree, "src/components/checkout/CheckoutForm.tsx"), "utf8");
    const hidden = src.match(/name="address_type"/g) ?? [];
    assert.equal(hidden.length, 2, `${tree}: expected the typed-address AND saved-address hidden fields`);
  }
});
