import { redirect } from "next/navigation";
import { ExternalLink, Copy } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  getFeatureFlag,
  partnerDiscountCodeService,
  getActiveSubscription,
  CHANNEL_ID,
} from "@/lib/store";

export const metadata = {
  title: "Partner Offers",
};

export default async function PartnerOffersPage() {
  const enabled = await getFeatureFlag("partner_offers_enabled");
  if (!enabled) redirect("/account");

  const session = await getSession();
  if (!session) redirect("/account");

  const subscription = await getActiveSubscription(session.customerId);

  if (!subscription) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-4">Partner Offers</h1>
        <div className="border border-zinc-200 rounded-lg p-6 text-center">
          <p className="text-zinc-600 mb-4">
            Partner offers are exclusively available to members.
          </p>
          <a
            href="/account/membership"
            className="inline-block bg-zinc-900 text-white py-2 px-6 rounded-lg hover:bg-zinc-800 transition-colors text-sm font-medium"
          >
            Join Now
          </a>
        </div>
      </div>
    );
  }

  const codes = await partnerDiscountCodeService.getForCustomer(
    session.customerId,
    CHANNEL_ID
  );

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-2">Partner Offers</h1>
      <p className="text-zinc-600 mb-8">
        Exclusive discounts from our partner network, available to members.
      </p>

      {codes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {codes.map((item) => (
            <div
              key={item.code.id}
              className="border border-zinc-200 rounded-lg p-5"
            >
              <div className="flex items-start gap-3 mb-3">
                {item.partnerLogo && (
                  <img
                    src={item.partnerLogo}
                    alt={item.partnerName}
                    className="h-10 w-10 rounded object-contain"
                  />
                )}
                <div>
                  <h3 className="font-semibold text-zinc-900">
                    {item.offerTitle}
                  </h3>
                  <p className="text-xs text-zinc-500">{item.partnerName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                  {item.discountType === "percentage"
                    ? `${item.discountValue}% off`
                    : item.discountType === "fixed"
                      ? `$${parseFloat(item.discountValue ?? "0").toFixed(2)} off`
                      : "Free item"}
                </span>
              </div>

              <div className="bg-zinc-50 rounded p-3 flex items-center justify-between">
                <code className="text-sm font-mono text-zinc-900">
                  {item.code.code}
                </code>
                <Copy className="h-4 w-4 text-zinc-400 cursor-pointer hover:text-zinc-600" />
              </div>

              {item.externalUrl && (
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mt-3"
                >
                  Visit partner
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-zinc-500 text-center py-12 border border-zinc-200 rounded-lg">
          No partner offers are currently available.
        </p>
      )}
    </div>
  );
}
