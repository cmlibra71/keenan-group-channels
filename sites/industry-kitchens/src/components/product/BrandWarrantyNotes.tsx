import { ShieldCheck, AlertTriangle } from "lucide-react";

export function BrandWarrantyNotes({
  warranty_text,
  extended_warranty,
  installation_notes,
}: {
  warranty_text?: string;
  extended_warranty?: { name: string; body: string; link?: string };
  installation_notes?: string[];
}) {
  if (!warranty_text && !extended_warranty && (!installation_notes || installation_notes.length === 0)) {
    return null;
  }
  return (
    <div className="mt-8 space-y-6">
      {warranty_text && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">Warranty</h3>
              <p className="mt-1 text-sm text-emerald-800 leading-relaxed">{warranty_text}</p>
            </div>
          </div>
        </div>
      )}

      {extended_warranty && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-900">{extended_warranty.name}</h3>
          <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{extended_warranty.body}</p>
          {extended_warranty.link && (
            <a
              href={extended_warranty.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              Learn more →
            </a>
          )}
        </div>
      )}

      {installation_notes && installation_notes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Installation Notes</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-800 leading-relaxed">
                {installation_notes.map((note, i) => (
                  <li key={i}>• {note}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
