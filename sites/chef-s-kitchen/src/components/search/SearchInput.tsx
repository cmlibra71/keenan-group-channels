"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Search, Loader2 } from "lucide-react";

export function SearchInput({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = (formData.get("q") as string).trim();
    if (q) {
      startTransition(() => {
        router.push(`/search?q=${encodeURIComponent(q)}`);
      });
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative">
        {isPending ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 animate-spin" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
        )}
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search products..."
          className="w-full pl-10 pr-4 py-3 rounded-lg border border-zinc-300 text-sm focus:border-zinc-500 focus:outline-none"
          autoFocus
          disabled={isPending}
        />
      </div>
      {isPending && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-zinc-500"
            style={{
              width: "40%",
              animation: "searchSlide 1s ease-in-out infinite alternate",
            }}
          />
          <style>{`
            @keyframes searchSlide {
              0% { margin-left: 0%; }
              100% { margin-left: 60%; }
            }
          `}</style>
        </div>
      )}
      {isPending && (
        <p className="mt-3 text-sm text-zinc-500">Searching...</p>
      )}
    </form>
  );
}
