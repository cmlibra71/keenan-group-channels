"use client";

import { Truck, Wrench } from "lucide-react";
import {
  DELIVERY_SERVICES,
  DELIVERY_SERVICE_COPY,
  type DeliveryService,
} from "@/lib/checkout/bulky-delivery";

/** The premises types we ask about. Free text on the profile, a short list here. */
export const SITE_TYPES = [
  "Restaurant, cafe or bar",
  "Commercial kitchen",
  "Shopping centre or food court",
  "Warehouse or factory",
  "School, hospital or aged care",
  "Residential",
  "Other",
];

/**
 * The bulky-item delivery choice (card Wxjp8wpg). Shown only when the cart holds a product
 * ticked bulky; the shopper MUST pick before the order can be placed, and picking specialised
 * opens the site-access questions and holds the order instead of charging the card.
 *
 * Every input is a plain named form field — the choice and the answers post with the rest of
 * checkout and are re-validated server-side by placeOrder.
 */
export function BulkyDeliveryChoice({
  productNames,
  value,
  onChange,
}: {
  productNames: string[];
  value: DeliveryService | "";
  onChange: (value: DeliveryService) => void;
}) {
  if (productNames.length === 0) return null;
  const icons = { curbside: Truck, specialised: Wrench };

  return (
    <div className="border border-steel-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-ink-900 mb-1">How should we deliver this?</h2>
      <p className="mb-4 text-sm text-steel-500">
        {productNames.length === 1
          ? `${productNames[0]} is a large item, so it needs a delivery method.`
          : `${productNames.slice(0, 2).join(", ")}${
              productNames.length > 2 ? ` and ${productNames.length - 2} more` : ""
            } are large items, so this order needs a delivery method.`}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {DELIVERY_SERVICES.map((service) => {
          const copy = DELIVERY_SERVICE_COPY[service];
          const Icon = icons[service];
          const selected = value === service;
          return (
            <label
              key={service}
              className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors ${
                selected ? "border-brand bg-steel-50" : "border-steel-200 hover:border-steel-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="deliveryService"
                  value={service}
                  checked={selected}
                  onChange={() => onChange(service)}
                  className="mt-0.5"
                />
                <Icon className="h-5 w-5 text-steel-500" aria-hidden />
                <span className="text-sm font-semibold text-ink-900">{copy.title}</span>
              </span>
              <span className="text-xs text-steel-600">{copy.blurb}</span>
              <span className="text-xs font-medium text-ink-900">{copy.note}</span>
            </label>
          );
        })}
      </div>

      {value === "specialised" && (
        <div className="mt-4 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            We&apos;ll quote the delivery and come back to you to arrange a time and take payment.
            Nothing is charged now.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink-700">
                What kind of site is it?
              </label>
              <select
                name="siteDeliveryType"
                required
                defaultValue=""
                className="mt-1 block w-full rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm focus:border-steel-500 focus:outline-none"
              >
                <option value="" disabled>
                  Choose…
                </option>
                {SITE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700">
                Can a delivery truck reach the site?
              </label>
              <div className="mt-2 flex gap-4 text-sm text-ink-700">
                <label className="flex items-center gap-2">
                  <input type="radio" name="siteTruckAccess" value="yes" required /> Yes
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="siteTruckAccess" value="no" required /> No / not sure
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="siteLoadingDock" value="1" className="accent-brand" />
              Loading dock on site
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="siteForklift" value="1" className="accent-brand" />
              Forklift on site
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="siteTwoPerson" value="1" className="accent-brand" />
              Needs two people to place
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink-700">
                Deliveries accepted from
              </label>
              <input
                type="time"
                name="siteWindowStart"
                className="mt-1 block w-full rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm focus:border-steel-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700">until</label>
              <input
                type="time"
                name="siteWindowEnd"
                className="mt-1 block w-full rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm focus:border-steel-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700">
              Anything else we should know? (stairs, lift size, parking, gate codes)
            </label>
            <textarea
              name="siteAccessComments"
              rows={3}
              className="mt-1 block w-full rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm focus:border-steel-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
