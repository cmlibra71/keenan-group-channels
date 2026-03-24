import Link from "next/link";
import Image from "next/image";
import { Trophy, ArrowRight } from "lucide-react";

type Prize = {
  id: number;
  name: string;
  imageUrl: string | null;
  value: string | null;
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
    <section className="relative bg-navy overflow-hidden grain">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-16 sm:py-24">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16 items-center">
          {/* Prize image — clean, no rounded corners */}
          <div className="md:col-span-5">
            <div className="overflow-hidden bg-navy-light aspect-square relative">
              {prize.imageUrl ? (
                <Image
                  src={prize.imageUrl}
                  alt={prize.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 42vw"
                  className="object-contain"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <Trophy className="h-16 w-16 text-teal/20" />
                </div>
              )}
            </div>
          </div>

          {/* Info — editorial layout */}
          <div className="md:col-span-7">
            <p className="heading-sans text-teal tracking-widest mb-5">
              Members-Only Prize Draw
            </p>
            <h2 className="heading-serif text-3xl sm:text-4xl text-white mb-3">{prize.name}</h2>
            {value != null && value > 0 && (
              <p className="heading-serif text-2xl text-teal-light mb-3">
                Valued at ${value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            )}
            {draw?.scheduledAt && (
              <p className="text-sm text-slate-500 mb-6 tracking-wide">
                Draw date: {new Date(draw.scheduledAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-lg">
              The longer you stay a member, the better your odds. Entries accumulate every month and never reset.
            </p>
            <Link
              href="/membership#draws"
              className="inline-flex items-center gap-2.5 bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
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
