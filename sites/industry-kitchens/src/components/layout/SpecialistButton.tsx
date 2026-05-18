"use client";

import { useState } from "react";
import Link from "next/link";
import { Headset, Phone, MessageSquare, X } from "lucide-react";

// Floating "Talk to a Specialist" action — fixed bottom-right, opens a small
// card with quick contact options.
export function SpecialistButton({ phone }: { phone?: string }) {
  const [open, setOpen] = useState(false);
  const phoneHref = phone
    ? `tel:+61${phone.replace(/\D/g, "").replace(/^0/, "")}`
    : undefined;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div className="w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
          <div className="bg-[#D94B2B] px-4 py-3">
            <p className="text-sm font-bold text-white">Talk to a Specialist</p>
            <p className="mt-0.5 text-xs text-white/85">
              Help with equipment, kitchen design &amp; finance.
            </p>
          </div>
          <div className="flex flex-col p-2">
            {phoneHref && (
              <a
                href={phoneHref}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D94B2B]/10 text-[#D94B2B]">
                  <Phone className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[11px] uppercase tracking-wide text-zinc-400">
                    Call us
                  </span>
                  <span className="block text-sm font-semibold text-zinc-900">{phone}</span>
                </span>
              </a>
            )}
            <Link
              href="/pages/contact"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D94B2B]/10 text-[#D94B2B]">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[11px] uppercase tracking-wide text-zinc-400">
                  Online
                </span>
                <span className="block text-sm font-semibold text-zinc-900">
                  Send us a message
                </span>
              </span>
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Talk to a Specialist"
        className="inline-flex items-center gap-2 rounded-full bg-[#D94B2B] py-3 pl-4 pr-5 font-semibold text-white shadow-lg shadow-[#D94B2B]/30 transition-colors hover:bg-[#C73629]"
      >
        {open ? <X className="h-5 w-5" /> : <Headset className="h-5 w-5" />}
        <span className="text-sm">Talk to a Specialist</span>
      </button>
    </div>
  );
}
