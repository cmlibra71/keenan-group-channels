# ADR 0001 — Quotes defer member & bulk tier pricing to staff review

Status: accepted · 2026-07-01

## Context

The cart and the quote both turn a product into a stored `{ listPrice, salePrice }`
line. The cart applies the full best-price-wins stack (catalog sale → member
cost-plus → bulk quantity-break tier) and re-prices on every quantity change,
because the amount is charged immediately. See `lib/pricing/cart-pricing.ts`.

A quote is a B2B request-for-pricing, not a charge. When an item is added to a
quote we deliberately store **only** the base price with catalog-sale suppression
applied — we do **not** apply the member (cost-plus) price or bulk tiers, and
`updateQuoteItem` does **not** re-price when the quantity crosses a bulk break.

## Decision

`addToQuote` applies base price + catalog-sale suppression only. Member and bulk
pricing are left off at add time and are applied by staff during quote review.
This is expressed in code by calling the shared `layerCartPrice` layerer with
`memberSalePrice: null` and `bulkUnit: null`, so the *suppression* semantics stay
identical to the cart (one tested definition) while the divergence is explicit.

## Rationale

- A quote's price is provisional; staff negotiate/adjust tiers on review, so
  auto-applying member/bulk pricing at add time would be overwritten anyway and
  could mislead the customer about the final figure.
- Re-pricing a quote line on quantity change would fight the staff-set price.

## Consequences

- A quote line shows RRP (or the channel's public sale price) until staff price it;
  a customer bumping quantity across a bulk break sees no automatic discount. This
  is intended, not a bug — do not "fix" it by routing quotes through the cart's
  full `resolveItemPricing`.
- If quotes ever need automatic member/bulk pricing, flip the two `null`s in
  `addToQuote` to the resolved member price / bulk unit; the layerer already
  supports it.
