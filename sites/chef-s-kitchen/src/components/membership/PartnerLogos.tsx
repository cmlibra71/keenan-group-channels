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
    <section className="section-bordered">
      <div className="container-page py-12">
        <p className="text-center heading-sans text-text-muted tracking-widest mb-8">
          Exclusive discounts from {uniquePartners.length} partner{uniquePartners.length !== 1 ? "s" : ""}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-10">
          {uniquePartners.map((partner) =>
            partner.partner_logo ? (
              <img
                key={partner.id}
                src={partner.partner_logo}
                alt={partner.partner_name}
                className="h-10 w-auto grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
              />
            ) : (
              <span
                key={partner.id}
                className="text-sm font-medium text-text-muted"
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
