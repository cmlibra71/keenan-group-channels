import { NextRequest, NextResponse } from "next/server";
import { summariseLinesFreight, cartService, channelSettingsService } from "@keenan/services";
import { gstSplit } from "@keenan/services/calc";
import { calculateShipping, CHANNEL_ID } from "@/lib/store";
import { cartLineGoodsExTax } from "@/lib/checkout/order-draft";
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

    // `address_type` is the ONE thing the body may say about the shipment, and it is the same
    // Places-derived hint the form posts to placeOrder and that gets stamped on the order — so
    // the summary and the charge read one value (card Xw9VQmAJ / HMtUxvwZ). Anything else, or
    // nothing, reads as unclassified and fires no address-triggered attribute.
    const addressType =
      body.address_type === "residential" || body.address_type === "commercial"
        ? (body.address_type as string)
        : null;

    // A zone can be rated by weight or item count as well as by dollars (BigCommerce table
    // rates, card Wxjp8wpg). The measures come from the shopper's OWN cart on the server —
    // never from the request body — so a quoted price can't be talked down by a crafted post.
    let measures:
      | {
          weightKg: number | null;
          itemCount: number | null;
          weightIncomplete: boolean;
          attributes: Array<{
            code: string;
            lines: number;
            units: number;
            override_value?: number | null;
          }>;
          addressType: string | null;
        }
      | undefined;
    try {
      const uuid = await getCartUuid();
      const cart = uuid ? await cartService.getByUuid(uuid) : null;
      const full = cart ? await cartService.getWithItems(cart.id) : null;
      if (full) {
        // Are the stored cart prices GST-inclusive? A goods-basis freight attribute is read
        // against the goods EX GST (card Xw9VQmAJ round 2), so the line figures are split the
        // one way the whole codebase splits GST — never a hand-written / 1.1.
        let pricesIncludeTax = false;
        try {
          const taxSetting = await channelSettingsService.getByKey(CHANNEL_ID, "prices_include_tax");
          pricesIncludeTax = taxSetting.setting_value === true || taxSetting.setting_value === "true";
        } catch {
          // Default: prices are ex-tax, same fallback the checkout uses.
        }
        const summary = await summariseLinesFreight(
          (full.items as Array<Record<string, unknown>>).map((i) => ({
            product_id: Number(i.product_id),
            quantity: Number(i.quantity) || 0,
            // What this line's goods are worth ex GST — the basis a `goods` percentage at
            // line/unit stacking reads. Taken from the SHOPPER'S OWN CART on the server, like
            // every other measure here, never from the posted body, and through the SAME
            // `cartLineGoodsExTax` the checkout's own line totals are built from, so the cart's
            // estimate and the order it becomes can never disagree about what the goods are worth.
            goods_ex_tax: cartLineGoodsExTax(
              {
                sale_price: (i.sale_price as string | null) ?? null,
                list_price: String(i.list_price ?? "0"),
                quantity: Number(i.quantity) || 0,
              },
              pricesIncludeTax
            ),
          }))
        );
        // `has_unweighed_lines` travels WITH the weight: 85% of the catalogue carries no
        // weight, so a part-weighed cart must not be rated on its weighed lines alone.
        measures = {
          weightKg: summary.weight_kg,
          itemCount: summary.item_count,
          weightIncomplete: summary.has_unweighed_lines,
          // The FREIGHT ATTRIBUTES this cart meets (card Xw9VQmAJ — the author-defined
          // replacement for the single bulky boolean): the zone's rate PLUS whatever surcharges
          // these goods carry. Read from the cart's own products, like every other measure
          // here, so a crafted post cannot price a bratt pan as an ordinary parcel.
          //
          // `subtotal` — what an `order`-stacked goods percentage is read against — still comes
          // from the posted body on this ESTIMATE route, exactly as the tier lookup and the
          // order-value cap always have. Nothing here is ever charged: `placeOrder` re-prices
          // freight against its own server-computed `subtotalExTax` before an order exists.
          attributes: summary.attributes,
          addressType,
        };
      }
    } catch {
      // No cart / lookup failure — an order-value zone (all of them today) doesn't need it.
    }

    const result = await calculateShipping(
      postcode,
      subtotal,
      // No cart on the server (a fresh session, or a lookup failure) still passes the address
      // type: an always/address attribute is about the DELIVERY, not the goods.
      measures ?? { weightKg: null, itemCount: null, weightIncomplete: true, addressType }
    );
    // `cost` is the rate card's own figure, which is EX GST (Tim, card twwZMnMY): a $30 flat
    // rate is $33 to pay. Both bases are named in the response so no caller has to guess —
    // reading the raw rate as inc-GST is exactly the defect this card fixed, and it under-charged
    // every Chefs Depot delivery by 10%. The split comes from the shared `gstSplit`, never a
    // hand-written `* 1.1` (services CONTEXT D4).
    const split = gstSplit(result.cost ?? 0, false);
    // The freight-attribute breakdown is STAFF-ONLY (card Xw9VQmAJ, Chris 2026-09-10: the
    // customer only ever sees a freight TOTAL). This route answers a shopper's browser, so the
    // named surcharges are stripped out here rather than relied upon not to be rendered.
    const { freight_attributes: _staffOnly, ...customerSafe } = result;
    void _staffOnly;
    return NextResponse.json({
      ...customerSafe,
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
