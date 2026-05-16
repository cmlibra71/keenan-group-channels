import Link from "next/link";
import Image from "next/image";

export type CustomerLogo = { name: string; image_url?: string; href?: string };

export function CustomerLogos({ heading, logos }: { heading?: string; logos?: CustomerLogo[] }) {
  if (!logos || logos.length === 0) return null;
  return (
    <section className="border-y border-zinc-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        {heading && (
          <h2 className="text-sm uppercase tracking-[0.18em] font-semibold text-zinc-500 text-center mb-10">
            {heading}
          </h2>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-12 lg:gap-x-16">
          {logos.map((logo) => {
            const inner = logo.image_url ? (
              <div className="relative h-10 w-28 sm:h-12 sm:w-32">
                <Image
                  src={logo.image_url}
                  alt={logo.name}
                  fill
                  sizes="128px"
                  className="object-contain grayscale opacity-70 hover:opacity-100 hover:grayscale-0 transition-all"
                />
              </div>
            ) : (
              <span className="text-base sm:text-lg font-semibold text-zinc-400 hover:text-zinc-700 transition-colors tracking-wide whitespace-nowrap">
                {logo.name}
              </span>
            );
            const key = logo.name + (logo.image_url ?? "");
            return logo.href ? (
              <Link key={key} href={logo.href} className="block">
                {inner}
              </Link>
            ) : (
              <div key={key}>{inner}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
