import { notFound } from "next/navigation";
import { getCategoryBySlug, getProducts } from "@/lib/commerce";
import { ProductGrid } from "@/components/product/ProductGrid";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const { products } = await getProducts({ categoryId: category.id, limit: 24 });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-2">{category.name}</h1>
      {category.description && (
        <p className="text-zinc-500 mb-8">{category.description}</p>
      )}

      <ProductGrid products={products} />
    </div>
  );
}
