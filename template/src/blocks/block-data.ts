import "server-only";

// ============================================================================
// Per-block template data providers (CMS v2.1) — the lists/facts a block's
// seed binds beyond its own props.* fields. template/IK fork.
// A provider may also AUGMENT props (returned under `props`).
// ============================================================================

import type { RenderContext } from "@keenan/services";
import { getValueBarItems, getCustomerLogos, getSubscriptionPlans } from "@/lib/store";
import { lucideSvg } from "./lucide-svg";

type Provider = (
  props: Record<string, unknown>,
  ctx?: RenderContext
) => Promise<Record<string, unknown>>;

const PROVIDERS: Record<string, Provider> = {
  value_bar: async (props) => {
    const items =
      Array.isArray(props.items) && props.items.length > 0
        ? (props.items as Array<{ icon?: string; title: string; description?: string }>)
        : await getValueBarItems();
    return {
      valueBarItems: items.map((it) => ({
        ...it,
        iconSvg: lucideSvg(it.icon, "h-8 w-8 shrink-0 text-zinc-700", { strokeWidth: 1.4, fallback: "package" }),
      })),
    };
  },
  why_shop: async (props) => {
    const items = (props.items as Array<{ icon?: string; heading: string; body?: string }>) ?? [];
    return {
      whyShopItems: items.map((it) => ({
        ...it,
        iconSvg: lucideSvg(it.icon, "h-6 w-6 text-amber-600", { fallback: "award" }),
      })),
    };
  },
  customer_logos: async (props) => {
    const fromProps = Array.isArray(props.logos) && (props.logos as unknown[]).length > 0;
    const data = fromProps
      ? { heading: props.heading as string | undefined, logos: props.logos as Array<Record<string, unknown>> }
      : ((await getCustomerLogos()) as { heading?: string; logos?: Array<Record<string, unknown>> });
    const logos = data.logos ?? [];
    return { customerLogos: { heading: data.heading ?? "", loop: [...logos, ...logos] } };
  },
  membership_cta: async () => {
    try {
      const plans = (await getSubscriptionPlans()) as Array<{
        price: string;
        billing_interval: string;
        benefits?: unknown;
      }>;
      const plan = plans?.[0];
      if (!plan) return { membership: { priceLabel: "", benefits: [] } };
      const benefits = Array.isArray(plan.benefits) ? (plan.benefits as string[]) : [];
      return {
        membership: {
          priceLabel: `$${parseFloat(plan.price).toFixed(2)}/${plan.billing_interval}`,
          benefits: benefits.slice(0, 4).map((text) => ({ text })),
        },
      };
    } catch {
      return { membership: { priceLabel: "", benefits: [] } };
    }
  },
  specialist_cta: async (props) => ({
    props: {
      phoneHref:
        typeof props.phone === "string" ? props.phone.replace(/\s+/g, "") : undefined,
    },
  }),
};

/** Extra template data for a block type (empty when no provider). */
export async function blockData(
  type: string,
  props: Record<string, unknown>,
  ctx?: RenderContext
): Promise<Record<string, unknown>> {
  const provider = PROVIDERS[type];
  return provider ? provider(props, ctx) : {};
}
