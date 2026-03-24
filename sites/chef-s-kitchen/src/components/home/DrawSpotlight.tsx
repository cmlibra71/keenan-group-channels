import Link from "next/link";
import Image from "next/image";
import { Trophy, ArrowRight } from "lucide-react";

type Prize = {
  id: number;
  name: string;
  imageUrl: string | null;
  value: string | null;
  productId?: number | null;
};

type Draw = {
  id: number;
  name: string;
  scheduledAt: string | Date | null;
};

export function DrawSpotlight({
  prize,
  draw,
}: {
  prize: Prize;
  draw?: Draw | null;
}) {
  const value = prize.value ? parseFloat(prize.value) : null;

  return (
    <section className="section-dark text-white">
      <div className="container-page py-12 sm:py-16">
        <div className="flex flex-col md:flex-row md:items-center gap-8">
          {/* Prize image */}
          <div className="md:w-1/3">
            <div className="overflow-hidden bg-surface-dark-alt aspect-square relative">
              {prize.imageUrl ? (
                <Image
                  src={prize.imageUrl}
                  alt={prize.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-contain"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <Trophy className="h-16 w-16 text-accent/30" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="md:w-2/3">
            <p className="eyebrow mb-2">Members-Only Prize Draw</p>
            <h2 className="heading-serif text-2xl sm:text-3xl text-white mb-2">{prize.name}</h2>
            {value != null && value > 0 && (
              <p className="text-xl font-bold text-accent mb-2">
                Valued at ${value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            )}
            {draw?.scheduledAt && (
              <p className="text-sm text-text-muted mb-4">
                Draw date: {new Date(draw.scheduledAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            <p className="text-slate-300 text-sm mb-6">
              The longer you stay a member, the better your odds. Entries accumulate every month and never reset.
            </p>
            <Link
              href="/membership#draws"
              className="btn-primary"
            >
              Learn More
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
