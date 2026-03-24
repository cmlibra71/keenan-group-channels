import { Trophy, Calendar } from "lucide-react";

type Draw = {
  id: number;
  name: string;
  scheduledAt: string | Date | null;
};

export function WinnerSpotlight({ upcomingDraws }: { upcomingDraws: Draw[] }) {
  // For now, show upcoming draws with "Be our first winner" messaging
  // Once winners are recorded, this can be extended to show anonymized winner info

  if (upcomingDraws.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-zinc-900">Upcoming Prize Draws</h2>
        <p className="mt-2 text-zinc-600">Be our next winner</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl mx-auto">
        {upcomingDraws.slice(0, 3).map((draw) => (
          <div
            key={draw.id}
            className="rounded-xl border border-zinc-200 p-5 text-center hover:shadow-md transition-shadow"
          >
            <Trophy className="h-8 w-8 text-amber-500 mx-auto mb-3" />
            <h3 className="font-semibold text-zinc-900 mb-1">{draw.name}</h3>
            {draw.scheduledAt && (
              <div className="flex items-center justify-center gap-1.5 text-sm text-zinc-500">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(draw.scheduledAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
