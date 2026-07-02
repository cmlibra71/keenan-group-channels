// ============================================================================
// CMS v2 locked widgets — template/IK fork (minimal set).
//
// The template scaffold and IK don't run v2 sub-block templates yet; this map
// exists because the shared TemplateRenderer/SubBlockRenderer import it. The
// portal palette intersects with /api/blocks/manifest, so nothing unimplemented
// is offered to editors. Widgets land here when this fork's product template
// moves to CMS v2 (Phase 2+).
// ============================================================================
import type { FC } from "react";
import type { RenderContext } from "@keenan/services";

export type WidgetComponent = FC<{ attrs: Record<string, unknown>; ctx?: RenderContext }>;

export const WIDGETS: Record<string, WidgetComponent> = {};
