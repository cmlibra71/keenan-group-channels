import Image from "next/image";
import { Trophy } from "lucide-react";

type Prize = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  value: string | null;
  productId?: number | null;
};

type Draw = {
  id: number;
  name: string;
  scheduledAt: string | Date | null;
};

export function PrizeShowcase({
  prize,
  draw,
}: {
  prize: Prize;
  draw?: Draw | null;
}) {
  const value = prize.value ? parseFloat(prize.value) : null;

  return (
    <section className="bg-zinc-900 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="text-center mb-10">
          <p className="text-amber-400 font-semibold text-sm uppercase tracking-wider mb-2">
            Members-Only Prize Draw
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Win Big Just by Being a Member
          </h2>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 overflow-hidden">
            {prize.imageUrl ? (
              <div className="relative aspect-video bg-zinc-800">
                <Image
                  src={prize.imageUrl}
                  alt={prize.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 672px"
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center py-16 bg-zinc-800">
                <Trophy className="h-20 w-20 text-amber-400/30" />
              </div>
            )}
            <div className="p-6 text-center">
              <h3 className="text-xl font-bold text-white mb-1">{prize.name}</h3>
              {prize.description && (
                <p className="text-sm text-zinc-400 mb-3">{prize.description}</p>
              )}
              {value != null && value > 0 && (
                <p className="text-2xl font-bold text-amber-400">
                  Valued at ${value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              )}
              {draw?.scheduledAt && (
                <p className="text-sm text-zinc-400 mt-2">
                  Draw date: {new Date(draw.scheduledAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
