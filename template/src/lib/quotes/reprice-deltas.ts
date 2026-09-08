import {
  hasMemberLadderSetting,
  readQuoteRepriceDeltas,
  type QuoteDeltaSummary,
} from "@keenan/services";

export type { QuoteDeltaSummary };

/**
 * Buying-group repricing on the SIGNED-IN quote page (card gk23c1VK, blueprint §9.3 / AC 19).
 *
 * A Chefs Depot quote reprices against live trade data and the account's
 * current buying-group level, so a line's price can move between the day the
 * quote was sent and the day it is accepted. The buyer is told about that
 * movement BEFORE they accept, line by line.
 *
 * THIS EXISTS BECAUSE THE STOREFRONT IS THE SECOND ACCEPTANCE DOOR. The emailed
 * link (`/q/<uuid>`, in the portal) is not the only place a quote is accepted
 * and paid: `/account/quotes/[id]` carries its own Accept and its own Pay. A
 * notice on only one of them would mean the same member, on the same quote,
 * reads the per-line movement on the email and nothing on the website — two of
 * our own customer-facing screens disagreeing about one record, with the
 * silent one being the one that also takes the money.
 *
 * Mirrors `keenan-group-portal/src/lib/quotes/ladder-state.ts` deliberately:
 * same reader, same gate, same tax rate in, so neither screen can invent its
 * own arithmetic.
 *
 * The gate is "has a ladder ever been configured on this channel", not "is one
 * on today" — switching a ladder off must not blank movement a customer was
 * already told about — and it exists because the read costs three queries
 * (quotes, quote_items, the append-only `cd_price_audit`) on every load of a
 * page that, on a channel with no ladder, can only ever get an empty answer.
 *
 * Failure-tolerant on purpose: a missing notice is bad, an unreachable quote is
 * worse.
 */
export async function readQuoteRepriceDeltasForChannel(
  quoteId: number,
  channelId: number,
  opts: { gstRate?: number } = {}
): Promise<QuoteDeltaSummary | null> {
  if (!Number.isFinite(quoteId) || !Number.isFinite(channelId)) return null;
  if (!(await hasMemberLadderSetting(channelId).catch(() => true))) return null;
  return readQuoteRepriceDeltas(quoteId, opts).catch(() => null);
}
