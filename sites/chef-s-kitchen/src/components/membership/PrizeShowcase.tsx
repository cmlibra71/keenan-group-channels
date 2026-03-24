import Image from "next/image";
import { Trophy } from "lucide-react";

type Prize = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  value: string | null;
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
    <section className="relative bg-navy overflow-hidden grain">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-24">
        <div className="text-center mb-12">
          <p className="heading-sans text-teal tracking-widest mb-3">
            Members-Only Prize Draw
          </p>
          <h2 className="heading-serif text-3xl sm:text-4xl text-white">
            Win Big Just by Being a Member
          </h2>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="border border-slate-700/50 bg-navy-light/50 overflow-hidden">
            {prize.imageUrl ? (
              <div className="relative aspect-video bg-navy-light">
                <Image
                  src={prize.imageUrl}
                  alt={prize.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 672px"
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center py-16 bg-navy-light">
                <Trophy className="h-20 w-20 text-teal/20" />
              </div>
            )}
            <div className="p-8 text-center">
              <h3 className="heading-serif text-xl text-white mb-2">{prize.name}</h3>
              {prize.description && (
                <p className="text-sm text-slate-400 mb-3">{prize.description}</p>
              )}
              {value != null && value > 0 && (
                <p className="heading-serif text-2xl text-teal-light">
                  Valued at ${value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              )}
              {draw?.scheduledAt && (
                <p className="text-sm text-slate-500 mt-3 tracking-wide">
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
