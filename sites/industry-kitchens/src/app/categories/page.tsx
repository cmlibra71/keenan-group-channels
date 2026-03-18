import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { getCategories } from "@/lib/store";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const metadata = {
  title: "Categories",
};

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Categories</h1>

      {categories.length === 0 ? (
        <p className="text-zinc-500">No categories found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/categories/${category.slug || category.id}`}
              className="group block rounded-lg border border-zinc-200 overflow-hidden hover:border-zinc-400 hover:shadow-sm transition-all"
            >
              <div className="relative aspect-[4/3] bg-zinc-100 overflow-hidden">
                {category.imageUrl ? (
                  <Image
                    src={category.imageUrl}
                    alt={category.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-zinc-300">
                    <Package className="h-12 w-12" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h2 className="text-lg font-semibold text-zinc-900">{category.name}</h2>
                {category.description && (
                  <p className="mt-1 text-sm text-zinc-500 line-clamp-2">
                    {stripHtml(category.description)}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
