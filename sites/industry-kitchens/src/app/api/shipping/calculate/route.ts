import { NextRequest, NextResponse } from "next/server";
import { summariseLinesFreight, cartService } from "@keenan/services";
import { gstSplit } from "@keenan/services/calc";
import { calculateShipping } from "@/lib/store";
import { getCartUuid } from "@/lib/cart";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const postcode = String(body.postcode || "").trim();
    const subtotal = parseFloat(String(body.subtotal || "0"));

    if (!postcode || postcode.length < 3) {
      return NextResponse.json(
        { error: "Valid postcode is required.", success: false, cost: 0 },
        { status: 400 }
      );
    }

    if (isNaN(subtotal) || subtotal < 0) {
      return NextResponse.json(
        { error: "Valid subtotal is required.", success: false, cost: 0 },
        { status: 400 }
      );
    }

    // A zone can be rated by weight or item count as well as by dollars (BigCommerce table
    // rates, card Wxjp8wpg). The measures come from the shopper's OWN cart on the server —
    // never from the request body — so a quoted price can't be talked down by a crafted post.
    let measures:
      | { weightKg: number | null; itemCount: number | null; weightIncomplete: boolean }
      | undefined;
    try {
      const uuid = await getCartUuid();
      const cart = uuid ? await cartService.getByUuid(uuid) : null;
      const full = cart ? await cartService.getWithItems(cart.id) : null;
      if (full) {
        const summary = await summariseLinesFreight(
          (full.items as Array<{ product_id: number; quantity: number }>).map((i) => ({
            product_id: i.product_id,
            quantity: Number(i.quantity) || 0,
          }))
        );
        // `has_unweighed_lines` travels WITH the weight: 85% of the catalogue carries no
        // weight, so a part-weighed cart must not be rated on its weighed lines alone.
        measures = {
          weightKg: summary.weight_kg,
          itemCount: summary.item_count,
          weightIncomplete: summary.has_unweighed_lines,
        };
      }
    } catch {
      // No cart / lookup failure — an order-value zone (all of them today) doesn't need it.
    }

    const result = await calculateShipping(postcode, subtotal, measures);
    // `cost` is the rate card's own figure, which is EX GST (Tim, card twwZMnMY): a $30 flat
    // rate is $33 to pay. Both bases are named in the response so no caller has to guess —
    // reading the raw rate as inc-GST is exactly the defect this card fixed, and it under-charged
    // every Chefs Depot delivery by 10%. The split comes from the shared `gstSplit`, never a
    // hand-written `* 1.1` (services CONTEXT D4).
    const split = gstSplit(result.cost ?? 0, false);
    return NextResponse.json({
      ...result,
      cost_ex_tax: split.exTax,
      cost_tax: split.tax,
      cost_inc_tax: split.incTax,
    });
  } catch (error) {
    console.error("Shipping calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate shipping.", cost: 0, success: false },
      { status: 500 }
    );
  }
}
