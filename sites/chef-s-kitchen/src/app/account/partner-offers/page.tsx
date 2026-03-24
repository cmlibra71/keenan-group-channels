import { redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Lock, ArrowRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  getFeatureFlag,
  getPartnerOffers,
  partnerDiscountCodeService,
  getActiveSubscription,
  CHANNEL_ID,
} from "@/lib/store";
import { CopyCodeButton } from "./CopyCodeButton";

export const metadata = {
  title: "Partner Offers",
};

export default async function PartnerOffersPage() {
  const enabled = await getFeatureFlag("partner_offers_enabled");
  if (!enabled) redirect("/account");

  const session = await getSession();
  if (!session) redirect("/account");

  const [subscription, allOffers] = await Promise.all([
    getActiveSubscription(session.customerId),
    getPartnerOffers(),
  ]);

  // Non-member: show preview with masked codes
  if (!subscription) {
    return (
      <div className="mx-auto max-w-3xl px-6 lg:px-8 section-padding">
        <p className="eyebrow mb-3">PARTNERS</p>
        <h1 className="text-3xl heading-serif text-text-primary mb-2">Partner Offers</h1>
        <p className="text-text-secondary mb-8">
          Exclusive discounts from our partner network, available to members.
        </p>

        {allOffers.length > 0 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {allOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="border border-border p-5 relative"
                >
                  <div className="flex items-start gap-3 mb-3">
                    {offer.partnerLogo && (
                      <img
                        src={offer.partnerLogo}
                        alt={offer.partnerName}
                        className="h-10 w-10 object-contain"
                      />
                    )}
                    <div>
                      <h3 className="font-semibold text-text-primary">
                        {offer.title}
                      </h3>
                      <p className="text-xs text-text-secondary">{offer.partnerName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full text-accent bg-accent-subtle">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      {offer.discountType === "percentage"
                        ? `${offer.discountValue ? parseFloat(String(offer.discountValue)) : 0}% off`
                        : offer.discountType === "fixed"
                          ? `$${offer.discountValue ? parseFloat(String(offer.discountValue)).toFixed(2) : "0.00"} off`
                          : "Free item"}
                    </span>
                  </div>

                  <div className="bg-surface-primary p-3 flex items-center justify-between">
                    <code className="text-sm font-mono text-text-muted select-none blur-sm">
                      XXXX-XXXX-XXXX
                    </code>
                    <Lock className="h-4 w-4 text-text-muted" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center border-2 border-accent/20 bg-surface-primary p-6">
              <h3 className="font-semibold text-text-primary mb-2">Unlock all partner codes</h3>
              <p className="text-sm text-text-secondary mb-4">
                Become a member to access exclusive discount codes from all our partners.
              </p>
              <Link
                href="/membership"
                className="btn-primary"
              >
                Join Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <div className="card-padded text-center">
            <p className="text-text-secondary mb-4">
              Partner offers are exclusively available to members.
            </p>
            <Link
              href="/membership"
              className="btn-primary"
            >
              Join Now
            </Link>
          </div>
        )}
      </div>
    );
  }

  const codes = await partnerDiscountCodeService.getForCustomer(
    session.customerId,
    CHANNEL_ID
  );

  // Group codes by partner name
  const grouped = codes.reduce<Record<string, typeof codes>>((acc, item) => {
    const group = item.partnerName || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  const groups = Object.keys(grouped).sort();

  return (
    <div className="mx-auto max-w-3xl px-6 lg:px-8 section-padding">
      <p className="eyebrow mb-3">PARTNERS</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-2">Partner Offers</h1>
      <p className="text-text-secondary mb-8">
        Exclusive discounts from our partner network, available to members.
      </p>

      {codes.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group}>
              {groups.length > 1 && (
                <h2 className="panel-title mb-3">{group}</h2>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {grouped[group].map((item) => (
                  <div
                    key={item.code.id}
                    className="border border-border p-5"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {item.partnerLogo && (
                        <img
                          src={item.partnerLogo}
                          alt={item.partnerName}
                          className="h-10 w-10 object-contain"
                        />
                      )}
                      <div>
                        <h3 className="font-semibold text-text-primary">
                          {item.offerTitle}
                        </h3>
                        <p className="text-xs text-text-secondary">{item.partnerName}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full text-accent bg-accent-subtle">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        {item.discountType === "percentage"
                          ? `${item.discountValue}% off`
                          : item.discountType === "fixed"
                            ? `$${parseFloat(item.discountValue ?? "0").toFixed(2)} off`
                            : "Free item"}
                      </span>
                    </div>

                    <div className="bg-surface-primary p-3 flex items-center justify-between">
                      <code className="text-sm font-mono text-text-primary">
                        {item.code.code}
                      </code>
                      <CopyCodeButton code={item.code.code} />
                    </div>

                    {item.externalUrl && (
                      <a
                        href={item.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-accent hover:text-accent-dark mt-3 transition-colors duration-300"
                      >
                        Visit partner
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-text-secondary text-center py-12 border border-border">
          No partner offers are currently available.
        </p>
      )}
    </div>
  );
}
