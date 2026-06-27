type PartnerOffer = {
  id: number;
  partner_name: string;
  partner_logo: string | null;
};

export function PartnerLogos({ offers }: { offers: PartnerOffer[] }) {
  if (offers.length === 0) return null;

  const uniquePartners = offers.reduce<PartnerOffer[]>((acc, offer) => {
    if (!acc.find((p) => p.partner_name === offer.partner_name)) {
      acc.push(offer);
    }
    return acc;
  }, []);

  return (
    <section className="border-y border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-center text-sm font-medium text-zinc-500 mb-6">
          Exclusive discounts from {uniquePartners.length} partner{uniquePartners.length !== 1 ? "s" : ""}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {uniquePartners.map((partner) =>
            partner.partner_logo ? (
              <img
                key={partner.id}
                src={partner.partner_logo}
                alt={partner.partner_name}
                className="h-10 w-auto grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
              />
            ) : (
              <span
                key={partner.id}
                className="text-sm font-medium text-zinc-400"
              >
                {partner.partner_name}
              </span>
            )
          )}
        </div>
      </div>
    </section>
  );
}
