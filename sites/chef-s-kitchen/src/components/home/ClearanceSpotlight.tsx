import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProductCard, type ProductCardProps } from "@/components/product/ProductCard";

type RowProduct = {
  id: number;
  name: string;
  sku?: string | null;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  brandName?: string | null;
  availability?: string | null;
  inventoryLevel?: number | null;
  inventoryTracking?: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
};

/**
 * Design-system horizontally-scrollable product row (featured / last-units).
 * Light section, design product cards, snap scrolling.
 */
export function ClearanceSpotlight({
  products,
  heading = "Last Units",
  eyebrow = "While Stocks Last",
  href = "/clearance",
  pricing,
}: {
  products: RowProduct[];
  heading?: string;
  eyebrow?: string;
  href?: string;
  pricing?: Pick<ProductCardProps, "isMember" | "planPrice"> & {
    memberPriceMap?: Record<number, number>;
  };
}) {
  if (products.length === 0) return null;

  return (
    <section className="section-bordered">
      <div className="container-page section-padding">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="eyebrow mb-3">{eyebrow}</p>
            <h2 className="section-title">{heading}</h2>
          </div>
          <Link href={href} className="hidden items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-hover sm:inline-flex">
            Shop all
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:thin]">
          {products.slice(0, 10).map((product) => (
            <div key={product.id} className="w-[240px] flex-none snap-start sm:w-[260px]">
              <ProductCard
                id={product.id}
                name={product.name}
                slug={product.urlPath || String(product.id)}
                sku={product.sku}
                price={product.price}
                salePrice={product.salePrice}
                imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
                brandName={product.brandName}
                memberPrice={pricing?.memberPriceMap?.[product.id] ?? null}
                isMember={pricing?.isMember}
                planPrice={pricing?.planPrice}
                clearance
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The scroll rail alone (CMS v2.1 — heading renders as an editable template). */
export function ClearanceRail({
  products,
  pricing,
}: {
  products: RowProduct[];
  pricing?: Pick<ProductCardProps, "isMember" | "planPrice"> & {
    memberPriceMap?: Record<number, number>;
  };
}) {
  if (products.length === 0) return null;
  return (
    <div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:thin]">
      {products.slice(0, 10).map((product) => (
        <div key={product.id} className="w-[240px] flex-none snap-start sm:w-[260px]">
          <ProductCard
            id={product.id}
            name={product.name}
            slug={product.urlPath || String(product.id)}
            sku={product.sku}
            price={product.price}
            salePrice={product.salePrice}
            imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
            brandName={product.brandName}
            memberPrice={pricing?.memberPriceMap?.[product.id] ?? null}
            isMember={pricing?.isMember}
            planPrice={pricing?.planPrice}
            clearance
          />
        </div>
      ))}
    </div>
  );
}
