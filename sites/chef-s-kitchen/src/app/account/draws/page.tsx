import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  getFeatureFlag,
  getUpcomingDraws,
  getActiveSubscription,
  drawEntryService,
  prizeService,
  CHANNEL_ID,
} from "@/lib/store";
import { EntryHero } from "@/components/draws/EntryHero";
import { PrizeCard } from "@/components/draws/PrizeCard";
import { DrawCountdown } from "@/components/draws/DrawCountdown";

export const metadata = {
  title: "My Draws",
};

export default async function DrawsPage() {
  const enabled = await getFeatureFlag("draws_enabled");
  if (!enabled) redirect("/account");

  const session = await getSession();
  if (!session) redirect("/account");

  type DrawEntry = {
    entry: { id: number; drawId: number; status: string; entryCount: number | null };
    drawName: string;
  };

  const [upcomingDraws, entries, activePrizes, activeSub] = await Promise.all([
    getUpcomingDraws(),
    drawEntryService.getEntriesForCustomer(session.customerId, CHANNEL_ID) as Promise<DrawEntry[]>,
    prizeService.listActiveForChannel(CHANNEL_ID),
    getActiveSubscription(session.customerId),
  ]);

  const activeEntries = entries.filter(
    (e) => e.entry.status === "active"
  );

  const totalTickets = activeEntries.reduce(
    (sum, e) => sum + (e.entry.entryCount ?? 1),
    0
  );

  const consecutiveMonths = activeSub?.consecutiveMonths ?? 0;

  // Find the highest-value prize
  const featuredPrize = activePrizes.length > 0
    ? activePrizes.reduce((best, p) => {
        const val = p.value ? parseFloat(p.value) : 0;
        const bestVal = best.value ? parseFloat(best.value) : 0;
        return val > bestVal ? p : best;
      })
    : null;

  const featuredDraw = featuredPrize ? upcomingDraws[0] ?? null : null;

  return (
    <div className="mx-auto max-w-3xl px-6 lg:px-8 py-20 sm:py-24">
      <p className="heading-sans text-teal tracking-widest mb-3">PRIZES</p>
      <h1 className="text-3xl heading-serif text-navy mb-8">My Draws</h1>

      {/* Entry Accumulation Hero */}
      <EntryHero totalEntries={totalTickets} consecutiveMonths={consecutiveMonths} />

      {/* Featured Prize */}
      {featuredPrize && featuredDraw && (
        <div className="mb-8">
          <h2 className="text-xl heading-serif text-navy mb-4">Featured Prize</h2>
          <PrizeCard
            prize={featuredPrize}
            drawName={featuredDraw.name}
            scheduledAt={featuredDraw.scheduledAt}
            myEntries={activeEntries
              .filter((e) => e.entry.drawId === featuredDraw.id)
              .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0)}
          />
        </div>
      )}

      {/* Upcoming Draws */}
      <p className="heading-sans text-teal tracking-widest mb-3">UPCOMING</p>
      <h2 className="text-xl heading-serif text-navy mb-4">Upcoming Draws</h2>
      {upcomingDraws.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          {upcomingDraws.map((draw) => {
            const myEntryCount = activeEntries
              .filter((e) => e.entry.drawId === draw.id)
              .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0);

            return (
              <div
                key={draw.id}
                className="border border-stone p-5 hover:shadow-md transition-shadow duration-300"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-navy">{draw.name}</h3>
                    {draw.description && (
                      <p className="text-sm text-ink-light mt-0.5">{draw.description}</p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full text-teal bg-teal/10 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                    {draw.status}
                  </span>
                </div>

                {draw.scheduledAt && (
                  <div className="mb-3">
                    <DrawCountdown targetDate={draw.scheduledAt} />
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-stone">
                  <span className="inline-flex items-center gap-1 bg-offwhite text-teal text-xs font-medium px-2 py-1 rounded-full">
                    Your entries: {myEntryCount}
                  </span>
                  {draw.entryDeadline && (
                    <p className="text-xs text-ink-light">
                      Entries close: {new Date(draw.entryDeadline).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-ink-light text-center py-8 border border-stone mb-8">
          No upcoming draws at this time.
        </p>
      )}

      {/* Past Entries */}
      {entries.some((e) => e.entry.status !== "active") && (
        <>
          <h2 className="text-xl heading-serif text-navy mb-4">Past Entries</h2>
          <div className="space-y-3">
            {entries
              .filter((e) => e.entry.status !== "active")
              .map((e) => (
                <div
                  key={e.entry.id}
                  className="flex items-center justify-between border border-stone p-4 opacity-60"
                >
                  <div>
                    <p className="font-medium text-navy">{e.drawName}</p>
                    <p className="text-xs text-ink-light">
                      {e.entry.entryCount} {(e.entry.entryCount ?? 1) === 1 ? "entry" : "entries"} &middot; {e.entry.status}
                    </p>
                  </div>
                  <Trophy className="h-4 w-4 text-ink-faint" />
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
