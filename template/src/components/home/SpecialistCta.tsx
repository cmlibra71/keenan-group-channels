import Link from "next/link";
import { Phone, Headset, ArrowRight } from "lucide-react";

export type SpecialistCtaProps = {
  heading?: string;
  body?: string;
  phone?: string;
  cta_text?: string;
  cta_href?: string;
};

export function SpecialistCta({ heading, body, phone, cta_text, cta_href }: SpecialistCtaProps) {
  if (!heading && !phone && !cta_href) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="rounded-2xl bg-zinc-900 text-white px-6 sm:px-12 py-10 flex flex-col lg:flex-row lg:items-center gap-6">
        <Headset className="h-10 w-10 text-amber-400 flex-shrink-0" />
        <div className="flex-1">
          {heading && <h2 className="text-2xl sm:text-3xl font-bold">{heading}</h2>}
          {body && <p className="mt-2 text-zinc-300">{body}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {phone && (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="inline-flex items-center justify-center gap-2 bg-white text-zinc-900 px-5 py-3 rounded-lg font-semibold text-sm hover:bg-zinc-100 transition-colors"
            >
              <Phone className="h-4 w-4" />
              {phone}
            </a>
          )}
          {cta_text && cta_href && (
            <Link
              href={cta_href}
              className="inline-flex items-center justify-center gap-2 border border-white/20 px-5 py-3 rounded-lg font-semibold text-sm hover:bg-white/10 transition-colors"
            >
              {cta_text}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
