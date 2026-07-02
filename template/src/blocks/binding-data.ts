// ============================================================================
// Binding data — maps a RenderContext to the KTL data object. template/IK
// baseline (extended when this fork's blocks go templatable).
// ============================================================================
import type { RenderContext } from "@keenan/services";

export function buildBindingData(ctx?: RenderContext): Record<string, unknown> {
  void ctx;
  return { settings: { channelName: "Store", membershipFromPrice: null } };
}
