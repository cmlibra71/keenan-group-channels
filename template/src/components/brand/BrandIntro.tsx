import { RichContent } from "@/components/content/RichContent";

export function BrandIntro({ html }: { html?: string | null }) {
  if (!html) return null;
  return (
    <section className="mb-10">
      <RichContent
        html={html}
        stripStyles
        className="prose prose-zinc max-w-none text-zinc-700 leading-relaxed"
      />
    </section>
  );
}
