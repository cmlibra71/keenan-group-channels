import { redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Lock, ArrowRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import {
  getFeatureFlag,
  getPartnerOffers,
  getActiveSubscriptionForContact,
  CHANNEL_ID,
} from "@/lib/store";
import { getCommerceClient } from "@keenan/services";
import { CopyCodeButton } from "./CopyCodeButton";
import { AccountShell } from "@/components/account/AccountShell";

// Discount-code row shape mirroring partnerDiscountCodeService.getForCustomer,
// but keyed by CONTACT (identity unification): the query matches contact-keyed
// rows directly, plus this contact's legacy customer-keyed rows through the
// customer_contact_map bridge (pre-cutover members keep their codes).
type ContactCode = {
  code: { id: number; code: string };
  offerTitle: string;
  partnerName: string | null;
  partnerLogo: string | null;
  discountType: string;
  discountValue: string | null;
  externalUrl: string | null;
};

async function getCodesForContact(contactId: number): Promise<ContactCode[]> {
  const sql = getCommerceClient();
  if (!sql) return [];
  const rows = await sql<
    {
      id: number;
      code: string;
      offer_title: string;
      partner_name: string | null;
      partner_logo: string | null;
      discount_type: string;
      discount_value: string | null;
      external_url: string | null;
    }[]
  >`
    SELECT pdc.id, pdc.code, po.title AS offer_title, po.partner_name, po.partner_logo,
           po.discount_type, po.discount_value, po.external_url
    FROM partner_discount_codes pdc
    JOIN partner_offers po ON po.id = pdc.partner_offer_id
    WHERE po.channel_id = ${CHANNEL_ID}
      AND pdc.status = 'active'
      AND (
        pdc.contact_id = ${contactId}
        OR pdc.customer_id IN (
          SELECT customer_id FROM customer_contact_map WHERE contact_id = ${contactId}
        )
      )`;
  return rows.map((r) => ({
    code: { id: r.id, code: r.code },
    offerTitle: r.offer_title,
    partnerName: r.partner_name,
    partnerLogo: r.partner_logo,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    externalUrl: r.external_url,
  }));
}

export const metadata = {
  title: "Partner Offers",
};

export default async function PartnerOffersPage() {
  const enabled = await getFeatureFlag("partner_offers_enabled");
  if (!enabled) redirect("/account");

  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/partner-offers"));

  const [subscription, allOffers] = await Promise.all([
    getActiveSubscriptionForContact(session.contactId),
    getPartnerOffers(),
  ]);

  // Non-member: show preview with masked codes
  if (!subscription) {
    return (
      <AccountShell>
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Partner Offers</h1>
        <p className="text-zinc-600 mb-8">
          Exclusive discounts from our partner network, available to members.
        </p>

        {allOffers.length > 0 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {allOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="border border-zinc-200 rounded-lg p-5 relative"
                >
                  <div className="flex items-start gap-3 mb-3">
                    {offer.partner_logo && (
                      <img
                        src={offer.partner_logo}
                        alt={offer.partner_name}
                        className="h-10 w-10 rounded object-contain"
                      />
                    )}
                    <div>
                      <h3 className="font-semibold text-zinc-900">
                        {offer.title}
                      </h3>
                      <p className="text-xs text-zinc-500">{offer.partner_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-block bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                      {offer.discount_type === "percentage"
                        ? `${offer.discount_value ? parseFloat(String(offer.discount_value)) : 0}% off`
                        : offer.discount_type === "fixed"
                          ? `$${offer.discount_value ? parseFloat(String(offer.discount_value)).toFixed(2) : "0.00"} off`
                          : "Free item"}
                    </span>
                  </div>

                  <div className="bg-zinc-50 rounded p-3 flex items-center justify-between">
                    <code className="text-sm font-mono text-zinc-400 select-none blur-sm">
                      XXXX-XXXX-XXXX
                    </code>
                    <Lock className="h-4 w-4 text-zinc-400" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center rounded-xl border-2 border-amber-200 bg-amber-50 p-6">
              <h3 className="font-semibold text-zinc-900 mb-2">Unlock all partner codes</h3>
              <p className="text-sm text-zinc-600 mb-4">
                Become a member to access exclusive discount codes from all our partners.
              </p>
              <Link
                href="/membership"
                className="inline-flex items-center gap-2 bg-amber-500 text-zinc-900 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-400 transition-colors"
              >
                Join Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <div className="border border-zinc-200 rounded-lg p-6 text-center">
            <p className="text-zinc-600 mb-4">
              Partner offers are exclusively available to members.
            </p>
            <Link
              href="/membership"
              className="inline-block bg-zinc-900 text-white py-2 px-6 rounded-lg hover:bg-zinc-800 transition-colors text-sm font-medium"
            >
              Join Now
            </Link>
          </div>
        )}
      </AccountShell>
    );
  }

  const codes = await getCodesForContact(session.contactId);

  // Group codes by partner name
  const grouped = codes.reduce<Record<string, typeof codes>>((acc, item) => {
    const group = item.partnerName || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  const groups = Object.keys(grouped).sort();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-2">Partner Offers</h1>
      <p className="text-zinc-600 mb-8">
        Exclusive discounts from our partner network, available to members.
      </p>

      {codes.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group}>
              {groups.length > 1 && (
                <h2 className="text-lg font-semibold text-zinc-900 mb-3">{group}</h2>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {grouped[group].map((item) => (
                  <div
                    key={item.code.id}
                    className="border border-zinc-200 rounded-lg p-5"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {item.partnerLogo && (
                        <img
                          src={item.partnerLogo}
                          alt={item.partnerName ?? ""}
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
                      <CopyCodeButton code={item.code.code} />
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
