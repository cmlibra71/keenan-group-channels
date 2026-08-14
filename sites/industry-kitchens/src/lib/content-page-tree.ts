// ============================================================================
// Which design a /pages/<slug> request renders — the one decision, on its own,
// so it can be read and tested without a database.
//
// Card wp4GM2tq ("No CMS capability to change content on existing pages such as
// chefsdepot.com.au/pages/shipping"): a policy page's OWN published design used
// to be gated behind `node_policy_template_enabled` as well as being published,
// so staff could edit and publish a page in the portal and shoppers kept seeing
// the old wording, with nothing anywhere saying why.
//
// Publishing is the only thing that reaches the storefront (behaviour register,
// cms-pages-admin), and it is a deliberate act by a person, so a page's own
// published tree is now the last word on every page kind. The flag still gates
// the SHARED policy layout: one template EVERY policy page is drawn through,
// including ones nobody has authored, so switching it on restyles the whole set
// at once and stays a per-site decision (card BNtsJACK).
// ============================================================================

export type ContentTreeSource =
  /** the page's own authored tree (published, or the draft in preview) */
  | "page"
  /** the shared policy layout template, which the page supplies data to */
  | "policy_layout"
  /** no tree applies — render the published blocks */
  | "blocks";

export interface ContentTreeChoice {
  source: ContentTreeSource;
  /** which payload shape the composer builds */
  kind: "policy" | "custom";
}

export function chooseContentPageTree(input: {
  pageKind: string;
  hasOwnTree: boolean;
  /** `node_policy_template_enabled` for this channel */
  policyLayoutEnabled: boolean;
  /** preview / render surface */
  draft: boolean;
}): ContentTreeChoice {
  const isPolicy = input.pageKind === "policy";
  if (input.hasOwnTree) {
    return { source: "page", kind: isPolicy ? "policy" : "custom" };
  }
  if (isPolicy && (input.policyLayoutEnabled || input.draft)) {
    return { source: "policy_layout", kind: "policy" };
  }
  return { source: "blocks", kind: "custom" };
}
