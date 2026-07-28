// Direct commerce-DB access for the E2E suite — used ONLY for teardown (and the
// pre-run sweep). All catalog/product fixtures are discovered by scraping the
// live site instead, so this file deliberately knows nothing about the product
// schema.
//
// Connects with the postgres.js driver (resolved from the repo root
// node_modules) using COMMERCE_DATABASE_URL — the same DB the dev site writes
// to. Treat every write here as touching production data: only ever scoped to
// the test-email pattern.
import postgres from "postgres";

let _sql = null;

/** Lazily open a small pooled connection to the commerce DB. */
export function getSql() {
  if (_sql) return _sql;
  const url = process.env.COMMERCE_DATABASE_URL;
  if (!url) throw new Error("COMMERCE_DATABASE_URL is not set (load the site .env first).");
  _sql = postgres(url, { max: 2, idle_timeout: 10, connect_timeout: 15 });
  return _sql;
}

export async function closeSql() {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
}

/**
 * Delete every row belonging to test customers whose email matches `emailLike`
 * (plus any explicit customerIds), in child→parent FK order, inside one
 * transaction. Returns a per-table count so the runner can audit cleanup.
 *
 * Why explicit deletes: orders/quotes/carts/reviews are `ON DELETE SET NULL`
 * against customers, so simply deleting the customer would orphan those rows in
 * production. We remove them by id instead.
 */
export async function purgeTestData({ emailLike = "e2e-%@e2e.test", extraCustomerIds = [] } = {}) {
  const sql = getSql();
  const counts = {};

  await sql.begin(async (tx) => {
    // 1. Resolve the test customer ids (by email pattern, plus any explicit ids).
    const customers = extraCustomerIds.length
      ? await tx`SELECT id FROM customers WHERE email LIKE ${emailLike} OR id IN ${tx(extraCustomerIds)}`
      : await tx`SELECT id FROM customers WHERE email LIKE ${emailLike}`;
    const customerIds = customers.map((r) => r.id);
    counts.customers_matched = customerIds.length;

    // 1b. Since the 2026-07-11 identity cutover the storefront writes CONTACTS,
    // not customers — registration, sessions and every cart/quote/order link now
    // hang off contacts.id. Resolve the test contacts too, or the run strands
    // test rows in production.
    const contacts = await tx`SELECT id FROM contacts WHERE email LIKE ${emailLike}`;
    const contactIds = contacts.map((r) => r.id);
    counts.contacts_matched = contactIds.length;

    // 2. Resolve dependent parent ids. `IN ${tx(ids)}` expands to a typed value
    // list — avoids the untyped-array type mismatch of ANY(array).
    //
    // NB: `orders` has NO customer_id column (storefront orders aren't linked to
    // the customer row — see report finding); identify test orders by the tagged
    // email stored in billing_address instead, so they're cleaned even if the
    // customer row is already gone.
    const orders = await tx`SELECT id FROM orders WHERE billing_address->>'email' LIKE ${emailLike}`;
    // Quotes/carts/subs may be keyed by EITHER identity (customer_id pre-cutover,
    // contact_id after) — collect both so nothing survives teardown.
    const anyCust = customerIds.length ? customerIds : [-1];
    const anyCont = contactIds.length ? contactIds : [-1];
    const [quotes, carts, subs] =
      customerIds.length || contactIds.length
        ? await Promise.all([
            tx`SELECT id FROM quotes WHERE customer_id IN ${tx(anyCust)} OR contact_id IN ${tx(anyCont)}`,
            tx`SELECT id FROM carts WHERE customer_id IN ${tx(anyCust)} OR contact_id IN ${tx(anyCont)}`,
            tx`SELECT id FROM subscriptions WHERE customer_id IN ${tx(anyCust)} OR contact_id IN ${tx(anyCont)}`,
          ])
        : [[], [], []];
    if (customerIds.length === 0 && contactIds.length === 0 && orders.length === 0) return;
    const orderIds = orders.map((r) => r.id);
    const quoteIds = quotes.map((r) => r.id);
    const cartIds = carts.map((r) => r.id);
    const subIds = subs.map((r) => r.id);

    const del = async (label, fn) => {
      const res = await fn();
      counts[label] = res.count ?? 0;
    };

    // 3. Delete children → parents.
    if (orderIds.length) {
      await del("order_transactions", () => tx`DELETE FROM order_transactions WHERE order_id IN ${tx(orderIds)}`);
      await del("order_shipping_addresses", () => tx`DELETE FROM order_shipping_addresses WHERE order_id IN ${tx(orderIds)}`);
      await del("order_items", () => tx`DELETE FROM order_items WHERE order_id IN ${tx(orderIds)}`);
      await del("orders", () => tx`DELETE FROM orders WHERE id IN ${tx(orderIds)}`);
    }
    if (quoteIds.length) {
      await del("quote_comments", () => tx`DELETE FROM quote_comments WHERE quote_id IN ${tx(quoteIds)}`);
      await del("quote_attachments", () => tx`DELETE FROM quote_attachments WHERE quote_id IN ${tx(quoteIds)}`);
      await del("quote_items", () => tx`DELETE FROM quote_items WHERE quote_id IN ${tx(quoteIds)}`);
      await del("quotes", () => tx`DELETE FROM quotes WHERE id IN ${tx(quoteIds)}`);
    }
    if (cartIds.length) {
      await del("cart_items", () => tx`DELETE FROM cart_items WHERE cart_id IN ${tx(cartIds)}`);
      await del("carts", () => tx`DELETE FROM carts WHERE id IN ${tx(cartIds)}`);
    }
    if (subIds.length) {
      await del("subscription_events", () => tx`DELETE FROM subscription_events WHERE subscription_id IN ${tx(subIds)}`);
      await del("subscriptions", () => tx`DELETE FROM subscriptions WHERE id IN ${tx(subIds)}`);
    }
    if (customerIds.length) {
      await del("product_reviews", () => tx`DELETE FROM product_reviews WHERE customer_id IN ${tx(customerIds)}`);
      await del("customer_addresses", () => tx`DELETE FROM customer_addresses WHERE customer_id IN ${tx(customerIds)}`);
      await del("customers", () => tx`DELETE FROM customers WHERE id IN ${tx(customerIds)}`);
    }

    // Contacts last: customer_contact_map is ON DELETE RESTRICT, so its rows must
    // go FIRST or the contact delete raises and the whole teardown rolls back.
    if (contactIds.length) {
      await del("customer_contact_map", () => tx`DELETE FROM customer_contact_map WHERE contact_id IN ${tx(contactIds)}`);
      await del("account_memberships", () => tx`DELETE FROM account_memberships WHERE contact_id IN ${tx(contactIds)}`);
      await del("customer_auth_tokens", () => tx`DELETE FROM customer_auth_tokens WHERE contact_id IN ${tx(contactIds)}`);
      await del("contact_addresses", () => tx`DELETE FROM customer_addresses WHERE contact_id IN ${tx(contactIds)}`);
      await del("contact_reviews", () => tx`DELETE FROM product_reviews WHERE contact_id IN ${tx(contactIds)}`);
      await del("draw_entries", () => tx`DELETE FROM draw_entries WHERE contact_id IN ${tx(contactIds)}`);
      await del("wishlists", () => tx`DELETE FROM wishlists WHERE contact_id IN ${tx(contactIds)}`);
      await del("crm_activities", () => tx`DELETE FROM crm_activities WHERE contact_id IN ${tx(contactIds)}`);
      await del("contacts", () => tx`DELETE FROM contacts WHERE id IN ${tx(contactIds)}`);
    }
  });

  return counts;
}

/**
 * Count remaining test identities — used to assert a clean teardown. Counts BOTH
 * tables (post-cutover the storefront creates contacts), so a non-zero result
 * means real leftovers in production, not a stale query.
 */
export async function countTestCustomers(emailLike = "e2e-%@e2e.test") {
  const sql = getSql();
  const rows = await sql`
    SELECT (SELECT count(*) FROM customers WHERE email LIKE ${emailLike})
         + (SELECT count(*) FROM contacts  WHERE email LIKE ${emailLike}) AS n`;
  return Number(rows[0].n);
}

/** The customer's member group + latest channel-2 subscription status (diagnostics). */
export async function getCustomerMembership(email) {
  if (!email) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT c.id, c.customer_group_id,
      (SELECT s.status FROM subscriptions s
         WHERE s.customer_id = c.id AND s.channel_id = 2
         ORDER BY s.id DESC LIMIT 1) AS sub_status
    FROM customers c WHERE lower(c.email) = ${String(email).toLowerCase()} LIMIT 1`;
  return rows[0] || null;
}

/** Look up an order by its order_number (for status/payment-status assertions). */
export async function getOrderByNumber(orderNumber) {
  if (!orderNumber) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT id, order_number, status, payment_status, payment_method, total_inc_tax,
           billing_address
    FROM orders WHERE order_number = ${orderNumber} LIMIT 1`;
  return rows[0] || null;
}
