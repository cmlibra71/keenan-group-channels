import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";

export type KnowledgeHubLink = { label: string; href: string; image_url?: string };

export function KnowledgeHub({ heading, links }: { heading?: string; links?: KnowledgeHubLink[] }) {
  if (!links || links.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
      <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-8">
        {heading ?? "Knowledge Hub"}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400 hover:shadow-sm transition-all"
          >
            {l.image_url && (
              <div className="relative h-10 w-10 flex-shrink-0">
                <Image
                  src={l.image_url}
                  alt={l.label}
                  fill
                  sizes="40px"
                  className="object-contain"
                />
              </div>
            )}
            <span className="flex-1 text-sm font-medium text-zinc-700 group-hover:text-zinc-900">
              {l.label}
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 transition-colors" />
          </Link>
        ))}
      </div>
    </section>
  );
}
