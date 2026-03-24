type PartnerOffer = {
  id: number;
  partnerName: string;
  partnerLogo: string | null;
};

export function PartnerLogos({ offers }: { offers: PartnerOffer[] }) {
  if (offers.length === 0) return null;

  const uniquePartners = offers.reduce<PartnerOffer[]>((acc, offer) => {
    if (!acc.find((p) => p.partnerName === offer.partnerName)) {
      acc.push(offer);
    }
    return acc;
  }, []);

  return (
    <section className="border-y border-stone bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-12">
        <p className="text-center heading-sans text-ink-faint tracking-widest mb-8">
          Exclusive discounts from {uniquePartners.length} partner{uniquePartners.length !== 1 ? "s" : ""}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-10">
          {uniquePartners.map((partner) =>
            partner.partnerLogo ? (
              <img
                key={partner.id}
                src={partner.partnerLogo}
                alt={partner.partnerName}
                className="h-10 w-auto grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
              />
            ) : (
              <span
                key={partner.id}
                className="text-sm font-medium text-ink-faint"
              >
                {partner.partnerName}
              </span>
            )
          )}
        </div>
      </div>
    </section>
  );
}
