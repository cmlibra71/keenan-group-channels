import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";

export type BannerBlockProps = {
  heading: string;
  subheading?: string;
  image_url?: string;
  cta_text?: string;
  cta_href?: string;
};

export function BannerBlock({ heading, subheading, image_url, cta_text, cta_href }: BannerBlockProps) {
  const content = (
    <div className="relative overflow-hidden rounded-2xl bg-zinc-900 text-white">
      {image_url && (
        <div className="absolute inset-0">
          <Image
            src={image_url}
            alt={heading}
            fill
            sizes="100vw"
            className="object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/80 via-zinc-900/40 to-transparent" />
        </div>
      )}
      <div className="relative px-6 sm:px-10 py-14 sm:py-20 max-w-2xl">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{heading}</h2>
        {subheading && <p className="mt-3 text-base sm:text-lg text-zinc-200">{subheading}</p>}
        {cta_text && cta_href && (
          <span className="mt-6 inline-flex items-center gap-2 bg-white text-zinc-900 px-5 py-2.5 rounded-lg text-sm font-semibold">
            {cta_text}
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {cta_href ? (
        <Link href={cta_href} className="block group">
          {content}
        </Link>
      ) : (
        content
      )}
    </section>
  );
}
