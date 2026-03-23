import { redirect } from "next/navigation";
import { Trophy, Ticket, Calendar } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  getFeatureFlag,
  getUpcomingDraws,
  drawEntryService,
  CHANNEL_ID,
} from "@/lib/store";

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

  const [upcomingDraws, entries] = await Promise.all([
    getUpcomingDraws(),
    drawEntryService.getEntriesForCustomer(session.customerId, CHANNEL_ID) as Promise<DrawEntry[]>,
  ]);

  const activeEntries = entries.filter(
    (e) => e.entry.status === "active"
  );

  const totalTickets = activeEntries.reduce(
    (sum, e) => sum + (e.entry.entryCount ?? 1),
    0
  );

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">My Draws</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border border-zinc-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-1">
            <Ticket className="h-4 w-4" />
            <span className="text-sm">Active Entries</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900">{totalTickets}</p>
        </div>
        <div className="border border-zinc-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">Upcoming Draws</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900">{upcomingDraws.length}</p>
        </div>
      </div>

      {/* Upcoming Draws */}
      <h2 className="text-xl font-semibold text-zinc-900 mb-4">Upcoming Draws</h2>
      {upcomingDraws.length > 0 ? (
        <div className="space-y-4 mb-8">
          {upcomingDraws.map((draw) => {
            const myEntries = activeEntries.filter(
              (e) => e.entry.drawId === draw.id
            );
            const myTickets = myEntries.reduce(
              (sum, e) => sum + (e.entry.entryCount ?? 1),
              0
            );

            return (
              <div
                key={draw.id}
                className="border border-zinc-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-zinc-900">{draw.name}</h3>
                    {draw.description && (
                      <p className="text-sm text-zinc-600 mt-1">
                        {draw.description}
                      </p>
                    )}
                    {draw.entryDeadline && (
                      <p className="text-xs text-zinc-500 mt-2">
                        Entries close: {new Date(draw.entryDeadline).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-zinc-900">
                      {myTickets} {myTickets === 1 ? "entry" : "entries"}
                    </p>
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      {draw.status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-zinc-500 text-center py-8 border border-zinc-200 rounded-lg mb-8">
          No upcoming draws at this time.
        </p>
      )}

      {/* Past Entries */}
      {entries.some((e) => e.entry.status !== "active") && (
        <>
          <h2 className="text-xl font-semibold text-zinc-900 mb-4">Past Entries</h2>
          <div className="space-y-3">
            {entries
              .filter((e) => e.entry.status !== "active")
              .map((e) => (
                <div
                  key={e.entry.id}
                  className="flex items-center justify-between border border-zinc-200 rounded-lg p-4 opacity-60"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{e.drawName}</p>
                    <p className="text-xs text-zinc-500">
                      {e.entry.entryCount} {(e.entry.entryCount ?? 1) === 1 ? "entry" : "entries"} &middot; {e.entry.status}
                    </p>
                  </div>
                  <Trophy className="h-4 w-4 text-zinc-400" />
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
