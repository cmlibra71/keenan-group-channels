import type { ReactNode } from "react";
import { Building2, CreditCard, FileText } from "lucide-react";
import type { PaymentMethodConfig } from "@keenan/services";
import { Price } from "@/components/ui/Price";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  paymentPosition,
  resolveNetTermsDays,
  resolvePaymentMethodConfig,
  netTermsMessage,
  outstandingGuidance,
  isCardMethod,
  transactionOutcomeLabel,
  type VisibleTransaction,
} from "@/lib/orders/order-presentation";
import type { PayBalanceDecision } from "@/lib/orders/pay-balance";
import { PANEL_TITLE_CLASS } from "@/lib/orders/order-page-styles";

// ============================================================================
// Payment details — where the money on this order stands, and how to settle it.
//
// Unpaid is the ordinary case on both storefronts, not the exception: plenty of
// orders sit on bank transfer or on account awaiting payment, so this section has
// to be as useful when nothing has been paid as when it has. When money is still
// owing on a bank transfer it repeats the bank details from the SAME channel
// setting the checkout confirmation page reads, so the customer can pay without
// hunting for an email.
//
// Which block that is comes from `outstandingGuidance`, one decision rather than
// three conditions in the markup, and every method question is asked of the
// method's FAMILY. Industry Kitchens' orders carry Zoey plugin ids — 3,722 of
// them say `banktransfer`, not `bank_transfer` — so a literal comparison would
// leave those customers looking at a red balance with nothing beside it.
//
// Two figures here are commercial statements, not display: what the customer still
// owes, and the term an account order will be invoiced on. Both are computed in
// order-presentation.ts, where they are unit-tested — and neither is ever guessed.
//
// A server component. Every figure is derived here; the raw transaction rows never
// arrive — the page projects them through `visibleTransaction` first, so gateway
// ids, gateway responses and fraud/AVS/CVV data cannot reach the browser.
// ============================================================================

function formatDateTime(value: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function PaymentSection({
  paymentMethod,
  paymentStatus,
  orderPayable,
  totalIncTax,
  refundedAmount,
  transactions,
  paymentMethods,
  orderNumber,
  netTermsDaysOnOrder,
  netTermsDaysOnAccount,
  xeroInvoiceNumber,
  xeroInvoiceStatus,
  payBalance,
  payBalancePanel,
}: {
  paymentMethod: string | null;
  paymentStatus: string | null;
  /**
   * False on a cancelled, declined or refunded order — which can still carry its
   * full balance on the row, and must never be asked to pay it. Derived on the
   * page from `orders.status` and handed over as a BOOLEAN: the raw column
   * carries finance-company names (`silverchef`, `food_by_us`) and a dev build
   * serialises a server component's props into the page.
   */
  orderPayable: boolean;
  totalIncTax: number;
  refundedAmount: number;
  transactions: VisibleTransaction[];
  paymentMethods: PaymentMethodConfig[];
  orderNumber: string | null;
  netTermsDaysOnOrder: number | null;
  netTermsDaysOnAccount: number | null;
  xeroInvoiceNumber: string | null;
  xeroInvoiceStatus: string | null;
  /** Whether this customer may settle the balance by card, decided on the server. */
  payBalance: PayBalanceDecision;
  /**
   * The already-rendered control that acts on that decision, or null. Handed in
   * rather than imported so this file — shared byte-for-byte by every storefront
   * — carries no route to a payment action on a site that does not offer one
   * (`lib/orders/pay-balance-site.tsx` is the seam that decides).
   */
  payBalancePanel: ReactNode;
}) {
  // Paid / refunded / outstanding in one pure step. The stored status is
  // authoritative for "settled" — orders imported from Zoey are marked paid with
  // no ledger rows at all — and a refund, whether recorded as a ledger row or
  // only as orders.refunded_amount, reduces both what was paid and what is due.
  const { paid, refunded, owed, settled } = paymentPosition({
    paymentStatus,
    totalIncTax,
    refundedAmount,
    transactions,
  });

  // Matched by id and then by family, so a legacy `banktransfer` order picks up
  // the bank details configured against `bank_transfer` today.
  const methodConfig = resolvePaymentMethodConfig(paymentMethod, paymentMethods);
  const bankDetails = methodConfig?.bankDetails;
  const reference = bankDetails?.reference?.trim() || orderNumber || undefined;
  // Order → account → channel default, and NO further. A number nobody agreed is
  // worse than no number: this is the term the business will invoice on.
  const netTermsDays = resolveNetTermsDays(
    netTermsDaysOnOrder,
    netTermsDaysOnAccount,
    methodConfig?.netTermsDays
  );

  // A balance still owing must never be printed on its own. Where the pay-by-card
  // control or its refusal sentence is already answering "what do I do now?",
  // this stays quiet; otherwise it names the bank, the account terms, or us.
  const guidance = outstandingGuidance({
    methodId: paymentMethod,
    orderPayable,
    owed,
    explainedElsewhere: payBalance.allowed || Boolean(payBalance.message),
  });

  return (
    <section className="mt-10">
      <h2 className={`${PANEL_TITLE_CLASS} mb-3`}>Payment</h2>

      <div className="border border-border rounded-card bg-white p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-text-muted">Payment method</dt>
            <dd className="text-text-primary font-medium">
              {paymentMethodLabel(paymentMethod, paymentMethods)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Payment status</dt>
            <dd className="text-text-primary font-medium">
              {settled && !["paid", "refunded"].includes((paymentStatus ?? "").toLowerCase())
                ? "Paid"
                : paymentStatusLabel(paymentStatus)}
            </dd>
          </div>
          <div>
            {/* Money actually moved, so these two always read inc GST — unlike the
                order totals above, which follow the storewide GST toggle. */}
            <dt className="text-text-muted">Amount paid (inc GST)</dt>
            <dd className="text-text-primary font-medium">
              <Price amount={paid} />
            </dd>
          </div>
          {/* Nothing is outstanding on a CANCELLED order, whatever the row still
              says: `paymentPosition` reports the untouched total as owed, and 890
              Industry Kitchens orders are cancelled-and-unpaid carrying $38m
              between them (prod 2026-08-15). Printing that in red under "Still
              outstanding" tells a customer they owe money on an order we called
              off. So the figure is stated only where it could actually be paid. */}
          {orderPayable && (
            <div>
              <dt className="text-text-muted">Still outstanding (inc GST)</dt>
              <dd
                className={
                  owed > 0 ? "text-sale-deep font-semibold" : "text-text-primary font-medium"
                }
              >
                <Price amount={owed} />
              </dd>
            </div>
          )}
          {refunded > 0 && (
            <div>
              <dt className="text-text-muted">Refunded (inc GST)</dt>
              <dd className="text-text-primary font-medium">
                <Price amount={refunded} />
              </dd>
            </div>
          )}
          {xeroInvoiceNumber && (
            <div>
              <dt className="text-text-muted">Invoice</dt>
              <dd className="text-text-primary font-medium">
                {xeroInvoiceNumber}
                {xeroInvoiceStatus ? (
                  <span className="text-text-secondary font-normal">
                    {" "}
                    — {xeroInvoiceStatus.toLowerCase()}
                  </span>
                ) : null}
              </dd>
            </div>
          )}
        </dl>

        {/* Recorded payments. Date, amount and outcome only — never a gateway id. */}
        {transactions.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Payments recorded</h3>
            <ul className="divide-y divide-border">
              {transactions.map((tx) => (
                <li key={tx.id} className="py-2 flex items-center justify-between gap-4 text-sm">
                  <span className="text-text-secondary">
                    {formatDateTime(tx.created_at)}
                    {formatDateTime(tx.created_at) ? " · " : ""}
                    {transactionOutcomeLabel(tx)}
                  </span>
                  <span className="text-text-primary font-medium whitespace-nowrap">
                    {/* A refund left the business — read it as −$35.00, not $-35.00. */}
                    {tx.event === "refund" ? "−" : ""}
                    <Price amount={Math.abs(tx.amount)} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Settle the balance by card (card Sh03niVC). The decision was made on
            the server and is re-made inside the action; this only renders it.

            A refusal that carries wording is PRINTED rather than silently
            dropping the control: a colleague who can see the balance but is not
            a Manager or Billing contact would otherwise meet a screen showing a
            debt with no way to clear it and no explanation. Refusals with no
            wording (nothing owing, card switched off, cancelled) are already
            explained by the figures and the panels around this one. */}
        {payBalance.allowed && payBalancePanel}
        {!payBalance.allowed && payBalance.message && (
          <p className="mt-5 rounded-lg border border-border bg-surface-secondary p-4 text-sm text-text-secondary">
            {payBalance.message}
          </p>
        )}

        {/* How to pay — bank transfer still owing. Same source and wording as the
            checkout confirmation page, so the two surfaces read as one. */}
        {guidance === "bank_transfer" && (
          <div className="mt-5 bg-accent-subtle border border-accent/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-accent-dark">How to pay</h3>
            </div>
            <p className="text-sm text-accent-dark">
              Please transfer the outstanding amount to the account below and use{" "}
              <strong>{reference}</strong> as the payment reference. Your order is processed once
              payment is received.
            </p>
            {bankDetails ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {bankDetails.bankName && (
                  <>
                    <dt className="text-accent font-medium">Bank</dt>
                    <dd className="text-accent-dark">{bankDetails.bankName}</dd>
                  </>
                )}
                {bankDetails.accountName && (
                  <>
                    <dt className="text-accent font-medium">Account Name</dt>
                    <dd className="text-accent-dark">{bankDetails.accountName}</dd>
                  </>
                )}
                {bankDetails.bsb && (
                  <>
                    <dt className="text-accent font-medium">BSB</dt>
                    <dd className="text-accent-dark">{bankDetails.bsb}</dd>
                  </>
                )}
                {bankDetails.accountNumber && (
                  <>
                    <dt className="text-accent font-medium">Account No.</dt>
                    <dd className="text-accent-dark">{bankDetails.accountNumber}</dd>
                  </>
                )}
                <dt className="text-accent font-medium">Reference</dt>
                <dd className="text-accent-dark">{reference}</dd>
              </dl>
            ) : (
              <p className="text-sm text-accent-dark mt-2">
                Please contact us for our bank account details to complete your payment.
              </p>
            )}
          </div>
        )}

        {guidance === "net_terms" && (
          <div className="mt-5 bg-member-bg border border-member/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-member-text" />
              <h3 className="text-sm font-semibold text-member-text">Invoice &amp; payment terms</h3>
            </div>
            <p className="text-sm text-member-text">
              {netTermsMessage(netTermsDays, xeroInvoiceNumber)}
            </p>
          </div>
        )}

        {/* Still owing, on a method we hold no instructions for — a purchase
            order, PayPal, or an id from before this business ran on this
            software. Better a plain sentence than a red figure on its own. */}
        {guidance === "contact_us" && (
          <div className="mt-5 bg-surface-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-text-secondary" />
              <h3 className="text-sm font-semibold text-text-primary">How to pay</h3>
            </div>
            <p className="text-sm text-text-secondary">
              There is still an amount outstanding on this order. Please contact us
              {reference ? (
                <>
                  , quoting <strong>{reference}</strong>,
                </>
              ) : null}{" "}
              and we will arrange payment with you.
            </p>
          </div>
        )}

        {isCardMethod(paymentMethod) && owed === 0 && transactions.length === 0 && (
          <p className="mt-5 flex items-center gap-2 text-sm text-text-secondary">
            <CreditCard className="h-4 w-4 text-accent" />
            Your card payment was processed successfully.
          </p>
        )}
      </div>
    </section>
  );
}
