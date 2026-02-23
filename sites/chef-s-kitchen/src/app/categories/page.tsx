import Link from "next/link";
import { Package } from "lucide-react";
import { getCategories } from "@/lib/store";
import { RichContent } from "@/components/content/RichContent";

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
              <div className="aspect-[4/3] bg-zinc-100 overflow-hidden">
                {category.imageUrl ? (
                  <img
                    src={category.imageUrl}
                    alt={category.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                  <RichContent
                    html={category.description}
                    stripStyles
                    className="mt-1 text-sm text-zinc-500 line-clamp-2"
                  />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
