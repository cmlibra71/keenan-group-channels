import { Search } from "lucide-react";

export const metadata = {
  title: "Search",
};

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Search</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
        <input
          type="search"
          placeholder="Search products..."
          className="w-full pl-10 pr-4 py-3 rounded-lg border border-zinc-300 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <div className="text-center py-16">
        <p className="text-zinc-500">Enter a search term to find products.</p>
      </div>
    </div>
  );
}
