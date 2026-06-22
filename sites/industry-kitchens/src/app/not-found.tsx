import Link from "next/link";
import { PackageX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 lg:px-8 section-padding text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 mb-4">
        <PackageX className="h-8 w-8 text-accent" />
      </div>
      <p className="eyebrow mb-3">404</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-3">Page not found</h1>
      <p className="text-text-secondary text-lg mb-8">
        Sorry, we couldn&apos;t find that page. It may have moved or no longer exists.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/" className="btn-primary">Back to home</Link>
        <Link href="/products" className="btn-secondary">Browse products</Link>
      </div>
    </div>
  );
}
