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
    <section className="border-y border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-center text-sm font-medium text-zinc-500 mb-6">
          Exclusive discounts from {uniquePartners.length} partner{uniquePartners.length !== 1 ? "s" : ""}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {uniquePartners.map((partner) =>
            partner.partnerLogo ? (
              <img
                key={partner.id}
                src={partner.partnerLogo}
                alt={partner.partnerName}
                className="h-10 w-auto grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
              />
            ) : (
              <span
                key={partner.id}
                className="text-sm font-medium text-zinc-400"
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
