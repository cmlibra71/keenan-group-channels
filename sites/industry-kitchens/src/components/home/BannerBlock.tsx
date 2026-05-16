import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";

export type BannerBlockProps = {
  heading: string;
  subheading?: string;
  image_url?: string;
  cta_text?: string;
  cta_href?: string;
  /** Alternates the image side for visual rhythm down the page. */
  flip?: boolean;
};

// Light marketing block: photo on one side, copy + CTA on the other. Matches
// the industrykitchens.com.au content sections (no dark overlay treatment).
export function BannerBlock({
  heading,
  subheading,
  image_url,
  cta_text,
  cta_href,
  flip = false,
}: BannerBlockProps) {
  const content = (
    <div className="grid grid-cols-1 md:grid-cols-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
      {image_url && (
        <div
          className={`relative aspect-[4/3] md:aspect-auto md:min-h-[20rem] bg-zinc-100 ${
            flip ? "md:order-2" : ""
          }`}
        >
          <Image
            src={image_url}
            alt={heading}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      )}
      <div className="flex flex-col justify-center px-6 sm:px-10 py-10 sm:py-12">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
          {heading}
        </h2>
        {subheading && (
          <p className="mt-3 text-base text-zinc-600 max-w-md">{subheading}</p>
        )}
        {cta_text && cta_href && (
          <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-md bg-[#D94B2B] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition-colors group-hover:bg-[#C73629]">
            {cta_text}
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
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
