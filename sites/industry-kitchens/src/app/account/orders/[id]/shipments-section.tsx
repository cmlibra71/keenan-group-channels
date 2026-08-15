import { Package, Truck, MapPin } from "lucide-react";
import { PANEL_TITLE_CLASS } from "@/lib/orders/order-page-styles";

// ============================================================================
// Delivery & dispatch.
//
// Nothing having shipped yet is by far the commonest state on Chefs Depot, so the
// empty state is written as a deliberate answer ("not yet dispatched, we'll email
// tracking") rather than an empty panel that reads as a broken page.
//
// When an order went out in more than one dispatch, each entry lists what was in
// it — resolved against the order's already-loaded line items, so no extra query.
// ============================================================================

interface AddressLike {
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state_or_province: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  shipping_method: string | null;
}

interface ShipmentLike {
  id: number;
  tracking_number: string | null;
  tracking_carrier: string | null;
  tracking_url: string | null;
  shipping_method: string | null;
  shipping_provider: string | null;
  shipped_at: string | Date | null;
  created_at: string | Date | null;
  items?: Array<{ id: number; order_item_id: number; quantity: number }>;
}

function formatDate(value: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function ShipmentsSection({
  address,
  deliveryNotes,
  requiredDeliveryDate,
  shipments,
  items,
}: {
  address: AddressLike | null;
  deliveryNotes: string | null;
  requiredDeliveryDate: string | null;
  shipments: ShipmentLike[];
  items: Array<{ id: number; name: string }>;
}) {
  const nameById = new Map(items.map((i) => [i.id, i.name]));
  const addressLines = address
    ? [
        [address.first_name, address.last_name].filter(Boolean).join(" "),
        address.company,
        address.address1,
        address.address2,
        [address.city, address.state_or_province, address.postal_code].filter(Boolean).join(" "),
        address.country,
      ].filter((line): line is string => Boolean(line && line.trim()))
    : [];

  return (
    <section className="mt-10">
      <h2 className={`${PANEL_TITLE_CLASS} mb-3`}>Delivery</h2>

      <div className="border border-border rounded-card bg-white p-5 space-y-5">
        {/* ── Where it's going ─────────────────────────────────────────────── */}
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
            <MapPin className="h-4 w-4 text-text-muted" />
            Delivery address
          </h3>
          {addressLines.length > 0 ? (
            <address className="not-italic text-sm text-text-secondary leading-relaxed">
              {addressLines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
              {address?.phone && <span className="block">{address.phone}</span>}
            </address>
          ) : (
            // Storefront checkout always writes one; portal- and Zoey-created
            // orders may not, and a blank block reads as a bug.
            <p className="text-sm text-text-secondary">No delivery address recorded.</p>
          )}
          {address?.shipping_method && (
            <p className="mt-2 text-sm text-text-secondary">
              <span className="text-text-muted">Delivery method:</span> {address.shipping_method}
            </p>
          )}
          {requiredDeliveryDate && (
            <p className="mt-1 text-sm text-text-secondary">
              <span className="text-text-muted">Required by:</span>{" "}
              {formatDate(requiredDeliveryDate)}
            </p>
          )}
          {deliveryNotes && (
            <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap">
              <span className="text-text-muted">Delivery notes:</span> {deliveryNotes}
            </p>
          )}
        </div>

        {/* ── What has actually gone out ───────────────────────────────────── */}
        <div className="border-t border-border pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
            <Truck className="h-4 w-4 text-text-muted" />
            {shipments.length > 1 ? `Dispatches (${shipments.length})` : "Dispatch"}
          </h3>

          {shipments.length === 0 ? (
            <div className="flex items-start gap-3 bg-surface-secondary rounded-lg p-4">
              <Package className="h-5 w-5 text-text-muted flex-shrink-0 mt-0.5" />
              <p className="text-sm text-text-secondary">
                Not yet dispatched — we&apos;ll email you tracking details as soon as your order
                leaves our warehouse.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {shipments.map((shipment, index) => {
                const carrier = shipment.tracking_carrier || shipment.shipping_provider;
                const dispatched = formatDate(shipment.shipped_at ?? shipment.created_at);
                const lines = (shipment.items ?? []).filter((si) => nameById.has(si.order_item_id));
                return (
                  <li key={shipment.id} className="py-3 first:pt-0 last:pb-0">
                    {shipments.length > 1 && (
                      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                        Dispatch {index + 1} of {shipments.length}
                      </p>
                    )}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      {carrier && (
                        <div>
                          <dt className="text-text-muted">Carrier</dt>
                          <dd className="text-text-primary font-medium">{carrier}</dd>
                        </div>
                      )}
                      {shipment.shipping_method && (
                        <div>
                          <dt className="text-text-muted">Service</dt>
                          <dd className="text-text-primary font-medium">
                            {shipment.shipping_method}
                          </dd>
                        </div>
                      )}
                      {dispatched && (
                        <div>
                          <dt className="text-text-muted">Dispatched</dt>
                          <dd className="text-text-primary font-medium">{dispatched}</dd>
                        </div>
                      )}
                      {shipment.tracking_number && (
                        <div>
                          <dt className="text-text-muted">Tracking number</dt>
                          <dd className="font-medium">
                            {shipment.tracking_url ? (
                              <a
                                href={shipment.tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:text-accent-hover underline"
                              >
                                {shipment.tracking_number}
                              </a>
                            ) : (
                              <span className="text-text-primary">{shipment.tracking_number}</span>
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {/* Only worth listing when the order went out in pieces. */}
                    {shipments.length > 1 && lines.length > 0 && (
                      <ul className="mt-2 text-sm text-text-secondary list-disc pl-5">
                        {lines.map((line) => (
                          <li key={line.id}>
                            {nameById.get(line.order_item_id)}
                            {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!carrier &&
                      !shipment.tracking_number &&
                      !shipment.shipping_method &&
                      !dispatched && (
                        <p className="text-sm text-text-secondary">
                          Dispatched — no tracking details were recorded for this consignment.
                        </p>
                      )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
