"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function SearchInput({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = (formData.get("q") as string).trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search products..."
          className="w-full pl-10 pr-4 py-3 rounded-lg border border-zinc-300 text-sm focus:border-zinc-500 focus:outline-none"
          autoFocus
        />
      </div>
    </form>
  );
}
