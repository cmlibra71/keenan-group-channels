import { Trophy, Calendar } from "lucide-react";

type Draw = {
  id: number;
  name: string;
  scheduledAt: string | Date | null;
};

export function WinnerSpotlight({ upcomingDraws }: { upcomingDraws: Draw[] }) {
  if (upcomingDraws.length === 0) return null;

  return (
    <section className="container-page section-padding">
      <div className="text-center mb-10">
        <p className="eyebrow mb-3">Coming Up</p>
        <h2 className="section-title">Upcoming Prize Draws</h2>
        <p className="mt-3 text-text-secondary">Be our next winner</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl mx-auto">
        {upcomingDraws.slice(0, 3).map((draw) => (
          <div
            key={draw.id}
            className="card-interactive text-center"
          >
            <Trophy className="h-7 w-7 text-accent mx-auto mb-4" strokeWidth={1.5} />
            <h3 className="font-medium text-text-primary mb-2">{draw.name}</h3>
            {draw.scheduledAt && (
              <div className="flex items-center justify-center gap-1.5 text-sm text-text-secondary">
                <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
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
