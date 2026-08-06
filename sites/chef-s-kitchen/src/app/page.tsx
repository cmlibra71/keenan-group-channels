import { draftMode, headers } from "next/headers";
import { getCmsPage, getFeatureFlag } from "@/lib/store";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { DEFAULT_HOME_BLOCKS } from "@/blocks/home-blocks";
import { renderHomeNodeBranch } from "@/builder/home-node-branch";

// The homepage is composed of CMS section blocks. Content/order is editable via
// the `home` CMS page; with none set it falls back to DEFAULT_HOME_BLOCKS — the
// current section order — so the page renders exactly as before.
export default async function HomePage() {
  // ═══ Site Builder node path — the home doc authored in the node designer.
  // The body of this branch used to live here, and only here, which is why
  // Industry Kitchens' homepage could not render a tree at all; it is now
  // engine (src/builder/home-node-branch.tsx) shared by both sites. ═══
  const node = await renderHomeNodeBranch();
  if (node) return node.element;

  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
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
