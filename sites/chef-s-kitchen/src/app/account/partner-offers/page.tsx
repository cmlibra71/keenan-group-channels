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
      <div className="mx-auto max-w-3xl px-6 lg:px-8 py-20 sm:py-24">
        <p className="heading-sans text-teal tracking-widest mb-3">PARTNERS</p>
        <h1 className="text-3xl heading-serif text-navy mb-2">Partner Offers</h1>
        <p className="text-ink-light mb-8">
          Exclusive discounts from our partner network, available to members.
        </p>

        {allOffers.length > 0 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {allOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="border border-stone p-5 relative"
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
                      <h3 className="font-semibold text-navy">
                        {offer.title}
                      </h3>
                      <p className="text-xs text-ink-light">{offer.partnerName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full text-teal bg-teal/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                      {offer.discountType === "percentage"
                        ? `${offer.discountValue ? parseFloat(String(offer.discountValue)) : 0}% off`
                        : offer.discountType === "fixed"
                          ? `$${offer.discountValue ? parseFloat(String(offer.discountValue)).toFixed(2) : "0.00"} off`
                          : "Free item"}
                    </span>
                  </div>

                  <div className="bg-offwhite p-3 flex items-center justify-between">
                    <code className="text-sm font-mono text-ink-faint select-none blur-sm">
                      XXXX-XXXX-XXXX
                    </code>
                    <Lock className="h-4 w-4 text-ink-faint" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center border-2 border-teal/20 bg-offwhite p-6">
              <h3 className="font-semibold text-navy mb-2">Unlock all partner codes</h3>
              <p className="text-sm text-ink-light mb-4">
                Become a member to access exclusive discount codes from all our partners.
              </p>
              <Link
                href="/membership"
                className="inline-flex items-center gap-2 bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
              >
                Join Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <div className="border border-stone p-6 text-center">
            <p className="text-ink-light mb-4">
              Partner offers are exclusively available to members.
            </p>
            <Link
              href="/membership"
              className="inline-block bg-teal text-white py-3.5 px-7 hover:bg-teal-light transition-colors duration-300 text-sm font-medium tracking-wide"
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
    <div className="mx-auto max-w-3xl px-6 lg:px-8 py-20 sm:py-24">
      <p className="heading-sans text-teal tracking-widest mb-3">PARTNERS</p>
      <h1 className="text-3xl heading-serif text-navy mb-2">Partner Offers</h1>
      <p className="text-ink-light mb-8">
        Exclusive discounts from our partner network, available to members.
      </p>

      {codes.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group}>
              {groups.length > 1 && (
                <h2 className="text-lg heading-serif text-navy mb-3">{group}</h2>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {grouped[group].map((item) => (
                  <div
                    key={item.code.id}
                    className="border border-stone p-5"
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
                        <h3 className="font-semibold text-navy">
                          {item.offerTitle}
                        </h3>
                        <p className="text-xs text-ink-light">{item.partnerName}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full text-teal bg-teal/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                        {item.discountType === "percentage"
                          ? `${item.discountValue}% off`
                          : item.discountType === "fixed"
                            ? `$${parseFloat(item.discountValue ?? "0").toFixed(2)} off`
                            : "Free item"}
                      </span>
                    </div>

                    <div className="bg-offwhite p-3 flex items-center justify-between">
                      <code className="text-sm font-mono text-navy">
                        {item.code.code}
                      </code>
                      <CopyCodeButton code={item.code.code} />
                    </div>

                    {item.externalUrl && (
                      <a
                        href={item.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-teal hover:text-teal-dark mt-3 transition-colors duration-300"
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
        <p className="text-ink-light text-center py-12 border border-stone">
          No partner offers are currently available.
        </p>
      )}
    </div>
  );
}
