import { NextRequest, NextResponse } from "next/server";
import { summariseLinesFreight, cartService } from "@keenan/services";
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
    return NextResponse.json(result);
  } catch (error) {
    console.error("Shipping calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate shipping.", cost: 0, success: false },
      { status: 500 }
    );
  }
}
