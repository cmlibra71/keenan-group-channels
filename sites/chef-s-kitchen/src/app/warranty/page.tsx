import { WarrantyDirectory } from "@/components/product/WarrantyDirectory";

export const metadata = {
  title: "Warranty & Service Directory",
  description:
    "Manufacturer warranty coverage, registration requirements and service contacts for every brand we carry across Australia.",
};

// The full 149-brand directory lives here; product pages show only the
// current product's brand (BrandWarranty) and link through to this page.
export default function WarrantyPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <WarrantyDirectory />
    </div>
  );
}
