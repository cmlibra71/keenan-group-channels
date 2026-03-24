import Image from "next/image";
import { Trophy } from "lucide-react";
import { DrawCountdown } from "./DrawCountdown";

type Prize = {
  id: number;
  name: string;
  imageUrl: string | null;
  value: string | null;
  productId?: number | null;
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
    <div className="rounded-xl border border-zinc-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Prize image */}
      <div className="relative aspect-video bg-zinc-100">
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
            <Trophy className="h-12 w-12 text-zinc-300" />
          </div>
        )}
        {drawType && (
          <span className="absolute top-2 right-2 bg-zinc-900/80 text-white text-xs font-medium px-2 py-0.5 rounded-full">
            {drawType}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-zinc-900">{prize.name}</h3>
        <p className="text-sm text-zinc-500">{drawName}</p>
        {value != null && value > 0 && (
          <p className="text-lg font-bold text-amber-600 mt-1">
            ${value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-medium px-2 py-1 rounded-full">
            Your entries: {myEntries}
          </span>
          {scheduledAt && <DrawCountdown targetDate={scheduledAt} />}
        </div>
      </div>
    </div>
  );
}
