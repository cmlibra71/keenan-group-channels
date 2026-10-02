import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { giftCardAmountLabel } from "./gift-card-display.ts";

const IK_AMOUNTS = ["50.00", "100.00", "150.00", "200.00", "250.00", "500.00"];

describe("gift card Amount dropdown labels (Zoey parity)", () => {
  it("ex GST — Zoey's own six figures", () => {
    assert.deepEqual(
      IK_AMOUNTS.map((a) => giftCardAmountLabel(a, false)),
      ["$45.45", "$90.91", "$136.36", "$181.82", "$227.27", "$454.55"]
    );
  });
  it("inc GST — the face values", () => {
    assert.deepEqual(
      IK_AMOUNTS.map((a) => giftCardAmountLabel(a, true)),
      ["$50.00", "$100.00", "$150.00", "$200.00", "$250.00", "$500.00"]
    );
  });
});
