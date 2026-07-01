import { draftMode } from "next/headers";
import { getCmsPage } from "@/lib/store";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { DEFAULT_HOME_BLOCKS } from "@/blocks/home-blocks";

// The homepage is composed of CMS section blocks. Content/order is editable via
// the `home` CMS page; with none set it falls back to DEFAULT_HOME_BLOCKS — the
// current section order — so the page renders exactly as before.
export default async function HomePage() {
  const { isEnabled: draft } = await draftMode();
  const home = await getCmsPage("home", draft);
  const blocks: RenderedBlock[] =
    home && Array.isArray(home.blocks) && home.blocks.length > 0
      ? (home.blocks as unknown as RenderedBlock[])
      : DEFAULT_HOME_BLOCKS.map((t) => ({ block_type: t, region: "main", props: {} }));
  return (
    <div>
      <BlockRenderer blocks={blocks} draft={draft} />
    </div>
  );
}
