import Image from "next/image";
import { Trophy } from "lucide-react";
import { DrawCountdown } from "./DrawCountdown";

type Prize = {
  id: number;
  name: string;
  imageUrl: string | null;
  value: string | null;
};

export function PrizeCard({
  prize,
  drawName,
  scheduledAt,
  myEntries,
  drawType,
}: {
  prize: Prize;
  drawName: string;
  scheduledAt?: string | Date | null;
  myEntries: number;
  drawType?: string;
}) {
  const value = prize.value ? parseFloat(prize.value) : null;

  return (
    <div className="border border-stone overflow-hidden hover:shadow-md transition-shadow">
      {/* Prize image */}
      <div className="relative aspect-video bg-stone-warm">
        {prize.imageUrl ? (
          <Image
            src={prize.imageUrl}
            alt={prize.name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Trophy className="h-12 w-12 text-ink-faint" strokeWidth={1.5} />
          </div>
        )}
        {drawType && (
          <span className="absolute top-2 right-2 bg-navy/80 text-white text-xs font-medium px-2 py-0.5 rounded-full">
            {drawType}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-navy">{prize.name}</h3>
        <p className="text-sm text-ink-light">{drawName}</p>
        {value != null && value > 0 && (
          <p className="text-lg font-bold text-teal mt-1">
            ${value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone">
          <span className="inline-flex items-center gap-1.5 text-teal text-xs font-medium px-2 py-1 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" />
            Your entries: {myEntries}
          </span>
          {scheduledAt && <DrawCountdown targetDate={scheduledAt} />}
        </div>
      </div>
    </div>
  );
}
