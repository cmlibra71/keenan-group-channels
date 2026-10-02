"use client";

// ============================================================================
// GiftCardPanel — Industry Kitchens' gift card fields (Zoey parity).
//
// The Zoey page (www.industrykitchens.com.au/gift-card, captured 2026-09-30) draws, above Qty and
// ADD TO QUOTE, in this order and with these words:
//   Amount *            <select> "-- Please select amount --", $45.45 … $454.55 while the site shows
//                       prices "Excluding GST" ($50 … $500 inc GST)
//   Recipient Name *    Recipient Email *    Sender Name *    Sender Email *
//   Special Message (0 of 250 characters max)   — optional textarea, counter live
//   * Required
// Zoey validates on the press ("This is a required field.", "Please enter a valid email address.
// For example johndoe@domain.com."), so the errors here appear only after Add to Quote is pressed
// (the handler in `@keenan/services/product-page` sets them) and each clears as its field is fixed.
//
// Sealed rather than authored for the reason the Instructions box is: the answers are live
// purchase state that has to travel with Add to Quote. WHERE it sits and WHEN it shows are the
// template's — page 69 places the `product-gift-card` node with Show-if `product.isGiftCard`.
// It renders nothing for a product that carries no gift card configuration.
// ============================================================================

import { useProductPurchase } from "@keenan/services/product-page";
import {
  GIFT_CARD_LABELS,
  giftCardMessageLabel,
  type GiftCardField,
} from "@keenan/services/gift-card";
import { useGst } from "@/lib/gst";
import { giftCardAmountLabel } from "@/lib/gift-card-display";

const inputClass = (invalid: boolean) =>
  `w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 ${
    invalid ? "border-red-500" : "border-zinc-300"
  }`;

export function GiftCardPanel() {
  const purchase = useProductPurchase();
  const { inclusive } = useGst();
  const config = purchase.product.giftCard ?? null;
  if (!config) return null;
  const values = purchase.giftCardValues;
  const errors = purchase.giftCardErrors;
  const set = (field: GiftCardField) => (e: { target: { value: string } }) =>
    purchase.setGiftCardValue(field, e.target.value);
  const message = values.message ?? "";

  const errorLine = (field: GiftCardField) =>
    errors[field] ? (
      <p id={`giftcard-${field}-error`} className="mt-1 text-xs text-red-600" role="alert">
        {errors[field]}
      </p>
    ) : null;

  const textField = (field: GiftCardField, label: string, type: "text" | "email") => (
    <div>
      <label htmlFor={`giftcard-${field}`} className="mb-1 block text-sm font-semibold text-zinc-900">
        <span className="mr-0.5 text-red-600" aria-hidden="true">*</span>
        {label}
      </label>
      <input
        id={`giftcard-${field}`}
        name={`giftcard[${field}]`}
        type="text"
        inputMode={type === "email" ? "email" : undefined}
        autoComplete="off"
        maxLength={255}
        value={values[field] ?? ""}
        onChange={set(field)}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={errors[field] ? `giftcard-${field}-error` : undefined}
        className={inputClass(!!errors[field])}
      />
      {errorLine(field)}
    </div>
  );

  return (
    <div className="mt-6 space-y-3 rounded-md border border-zinc-200 bg-zinc-100 p-4" data-gift-card-panel="">
      <div>
        <label htmlFor="giftcard-amount" className="mb-1 block text-sm font-semibold text-zinc-900">
          <span className="mr-0.5 text-red-600" aria-hidden="true">*</span>
          {GIFT_CARD_LABELS.amount}
        </label>
        <select
          id="giftcard-amount"
          name="giftcard[amount]"
          value={values.amount ?? ""}
          onChange={set("amount")}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? "giftcard-amount-error" : undefined}
          className={inputClass(!!errors.amount)}
        >
          <option value="">{GIFT_CARD_LABELS.amountPlaceholder}</option>
          {config.amounts.map((a) => (
            // The VALUE is the face value (inc GST) the action validates; the LABEL follows the
            // ex/inc GST switch exactly as Zoey's does ($45.45 ex, $50.00 inc).
            <option key={a} value={a}>
              {giftCardAmountLabel(a, inclusive)}
            </option>
          ))}
        </select>
        {errorLine("amount")}
      </div>
      {textField("recipientName", GIFT_CARD_LABELS.recipientName, "text")}
      {textField("recipientEmail", GIFT_CARD_LABELS.recipientEmail, "email")}
      {textField("senderName", GIFT_CARD_LABELS.senderName, "text")}
      {textField("senderEmail", GIFT_CARD_LABELS.senderEmail, "email")}
      <div>
        <label htmlFor="giftcard-message" className="mb-1 block text-sm font-semibold text-zinc-900">
          {giftCardMessageLabel(message.length, config.messageMaxLength)}
        </label>
        <textarea
          id="giftcard-message"
          name="giftcard[message]"
          rows={3}
          maxLength={config.messageMaxLength}
          value={message}
          onChange={set("message")}
          aria-invalid={errors.message ? true : undefined}
          className={inputClass(!!errors.message)}
        />
        {errorLine("message")}
      </div>
      <p className="text-xs font-semibold text-red-600">{GIFT_CARD_LABELS.required}</p>
    </div>
  );
}
