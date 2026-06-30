// Pure Stripe-gateway helpers — no DB, no `@/` imports, so they are unit-testable
// in isolation (see stripe-gateways.test.ts). The impure resolver that fetches the
// payment_gateways setting and applies the mode-match lives in gateway.ts.

export type StripeGatewayEntry = {
  provider: string;
  credentials: Record<string, string>;
  enabled?: boolean;
  testMode?: boolean;
};

/** The enabled Stripe entries from a raw payment_gateways setting value. */
export function enabledStripeGateways(gateways: StripeGatewayEntry[]): StripeGatewayEntry[] {
  return gateways.filter((g) => g.provider === "stripe" && g.enabled !== false);
}
