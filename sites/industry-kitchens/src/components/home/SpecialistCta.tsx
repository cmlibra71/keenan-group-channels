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
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-6 sm:px-12 py-10 flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#D94B2B]/10">
          <Headset className="h-7 w-7 text-[#D94B2B]" />
        </div>
        <div className="flex-1">
          {heading && (
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900">{heading}</h2>
          )}
          {body && <p className="mt-2 text-zinc-600">{body}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {phone && (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="inline-flex items-center justify-center gap-2 bg-[#D94B2B] text-white px-5 py-3 rounded-md font-bold uppercase tracking-wide text-sm hover:bg-[#C73629] transition-colors"
            >
              <Phone className="h-4 w-4" />
              {phone}
            </a>
          )}
          {cta_text && cta_href && (
            <Link
              href={cta_href}
              className="inline-flex items-center justify-center gap-2 border border-zinc-300 text-zinc-800 px-5 py-3 rounded-md font-semibold text-sm hover:border-[#D94B2B] hover:text-[#D94B2B] transition-colors"
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
