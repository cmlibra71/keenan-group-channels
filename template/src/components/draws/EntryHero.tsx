import { Ticket, Calendar } from "lucide-react";
import { EntryAccumulationChart } from "@/components/membership/EntryAccumulationChart";

export function EntryHero({
  totalEntries,
  consecutiveMonths,
}: {
  totalEntries: number;
  consecutiveMonths: number;
}) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white p-6 sm:p-8 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <Ticket className="h-4 w-4" />
            Your Active Entries
          </div>
          <p className="text-5xl font-bold text-amber-400">{totalEntries}</p>
          <div className="flex items-center gap-2 mt-2">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-sm text-zinc-300">
              {consecutiveMonths} consecutive month{consecutiveMonths !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="sm:w-1/2">
          <p className="text-xs text-zinc-400 mb-3 uppercase tracking-wider">Your accumulation progress</p>
          <div className="[&_p]:text-zinc-400 [&_span]:text-zinc-300 [&_.text-zinc-900]:text-white [&_.text-zinc-600]:text-zinc-300 [&_.bg-zinc-100]:bg-zinc-700">
            <EntryAccumulationChart currentMonth={consecutiveMonths} />
          </div>
        </div>
      </div>

      <div className="mt-6 bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-4 py-3">
        Cancelling your membership forfeits all {totalEntries} entries. They cannot be recovered.
      </div>
    </div>
  );
}
