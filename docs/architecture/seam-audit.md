# Seam audit — shared engine vs per-site visuals

**Date:** 2026-08-03 · **Scope:** `template/`, `sites/chef-s-kitchen`, `sites/industry-kitchens`,
`@keenan/services`, and the CMS component masters in the commerce DB.
**Question answered:** Chris's architectural direction — *don't share visual components between
the sites; share the engine underneath them. Where are the seams?*

**Method:** every `.ts/.tsx` under each site's `src/` classified against `template/src`
(byte-identical / diverged / site-only), diff sizes, last-touch dates from git on both sides,
import-graph hints; then a judgement pass over every Chefs Depot delta and spot-check diffs.
Read-only — no site behaviour was changed by this audit.

---

## 1. The three-layer model already exists

| Layer | Contents | Reality check |
|---|---|---|
| **`@keenan/services`** | Services, storefront data store, builder model + renderer, page-payload composers, forms pipeline, payments, search, email | Genuinely shared: portal + both sites consume it |
| **`template/`** | Reference storefront | IK is **84% byte-identical** to it (189/226 files) |
| **`sites/*`** | Per-site code | CD: 99 identical / 108 diverged / 38 site-only. IK: 189 / 29 / 8 |

The architecture Chris described is not a rebuild — it is this model with two defects fixed:
**engine code stranded in one site**, and **no drift detection through the template**.

Where each site's divergence lives says the seam found itself naturally:

- **CD's divergence** concentrates in `components/*` (product, membership, account, layout,
  home, cart) and `app/account` — visual identity plus CD-only features. Only 2 files under
  `lib/actions` differ.
- **IK's divergence** (29 files) is almost entirely skin: Header (236L), Footer (321L),
  home page (370L), MegaMenu, mobile nav, home components.

## 2. Classification of Chefs Depot's 146 deltas

### 2a. Stranded engine — functionality parked on the wrong side of the seam

These are **not visuals**. They exist only in `sites/chef-s-kitchen`, absent from `template/`
— which is the direct reason IK cannot render a builder page or host an enquiry form.

| Files | What it is | What its absence costs IK |
|---|---|---|
| `src/builder/` — 5 Builder*Page wrappers, `use-form-handlers`, `home-data`, `home-natives`, `live-gst`, `master-leaves`, `seeds/product` (11 files) | The entire client-side builder render path | Cannot display any node-tree page, master, or form |
| `app/pages/[slug]/page.tsx`, `app/page.tsx`, `app/products/[slug]/page.tsx`, `app/categories/[slug]/page.tsx`, `app/brands/[slug]/page.tsx` (diverged) | The server-side node-tree branch in each route | Same — routes never check `node_tree` |
| `app/api/forms/upload/route.ts`, `lib/actions/forms.ts`, `lib/actions/contact.ts`, `lib/form-uploads.ts`, `lib/turnstile.ts` | Form submission pipeline (uploads, spam, persistence) | No enquiry form possible |
| `app/node-preview/products/[slug]/page.tsx` | Editor preview route | Portal preview of IK pages impossible |
| `lib/store.ts` additions: `getChannelSetting`, `getJsonSetting`, `getFooterConfig`, `getHeaderNav`, `wantStripeTestMode` | Generic settings/config readers | Re-invented independently on IK (see 2c) |
| `lib/condition-context.ts` (diverged) | Builder condition context | Builder rendering prerequisite |
| `app/api/health/route.ts` — site-only on **both** sites, missing from template | Deploy health check | New sites start without it |

**Promotion target:** `template/` (site-shaped code) with truly site-agnostic parts pushed
down to `@keenan/services`. **This list is also, exactly, the "port the builder to IK"
prerequisite** — one job, two payoffs.

### 2b. Drift — same intent, versions out of sync

| File(s) | Direction | Evidence |
|---|---|---|
| **`sites/industry-kitchens/src/lib/actions/quote.ts`** | **IK behind — missing feature, not a broken one** (corrected 2026-08-04, see below) | IK lacks `acceptQuote` and `duplicateQuote` entirely (212 lines vs template's 330), and its quote detail page renders no `QuoteActions`. **IK customers cannot accept a quote.** |
| Account suite: `app/account/page.tsx`, `profile/page.tsx`, `AccountContacts`, `ProfileEditForm`, `AddressBook` (5 files) | CD behind template | Template got the "port chef account-details suite" commit (2026-07-11); CD — the origin of that code — was never re-synced |
| `components/product/WarrantyDirectory.tsx` | CD behind by one commit | Template touched 07-28, CD 07-27 |

Drift-by-porting is the mechanism: code originates in one site, gets copied (with fixes) to
the template, and the origin never picks the fixes back up. Nothing detects this today; the
scan script in this audit's scratchpad does, in ~30s.

> **Correction (2026-08-04).** The first version of this table claimed *"template & CD call
> `sendStaffNotification` ×2 + rate-limit + contact pre-link; IK has zero of the three… a
> quote request on IK likely emails no staff."* That was **wrong**, and wrong in a way worth
> recording. Those counts came from `grep -c`, which counted an **import plus a single call**
> as "×2" — and I inferred behaviour without reading the call sites. Reading them:
>
> - `sendStaffNotification` is called **once**, inside `acceptQuote`.
> - `slidingWindowAllow` is called **once**, inside `duplicateQuote`.
> - the contact pre-link is **identical** on both sites (1 each).
>
> All three "gaps" collapse into a single fact: **IK never had the accept/duplicate-quote
> feature** — actions and UI both. Quote *submission* notifies nobody on **either** site, by
> design (sales review in the portal). So this is a **missing feature and a product
> decision**, not a live defect silently losing enquiries.
>
> Method lesson for the rest of this audit: a grep count is a lead, never a finding. Every
> behavioural claim here should name the call site it read.

### 2c. Convergent evolution — the strongest evidence for the engine seam

Both sites **independently invented the same mechanisms** because the engine layer didn't
offer them:

- CD grew `getFooterConfig`/`getHeaderNav`; IK grew `getHeaderConfig`/`getHeaderNav`/
  `getHomepageSections`/`getHomepageCategoryTiles` — four parallel "read my
  header/footer/homepage from settings" helpers.
- Both sites hand-carry their own `app/api/health/route.ts`.

Where two deliberately-different sites write the same code twice, that code is engine by
definition.

### 2d. Visual identity + CD-only features — stays in `sites/*`, never shared

Everything else, and it is the majority: product/category/home/layout components, heroes,
auth forms styling, checkout look; and CD's membership, draws, warranty directory, partner
offers (13 site-only files + the `components/membership`, `components/draws` trees). IK's
mirror-image: its header/footer/home skin. **No action; this is the point of the seam.**

## 3. The DB-side seam: component masters

All 24 masters are CD's (`cms_components.channel_id` NOT NULL — sharing isn't representable,
and per Chris's direction it shouldn't be):

- **17 generic mechanisms** — filters (5), cards (6), product blocks (4), enquiry-form,
  policy-layout. The *mechanism* is generic; the styling is CD's.
- **7 CD-brand/feature visuals** — home spotlights, membership strip, stats banner, etc.

**The right sharing model here is already proven by the forms work:** share the *recipe*,
not the *cake*. `@keenan/services/builder/form-nodes.ts` is a shared node-builder that mints
per-site master *instances* (CD's enquiry-form master came from it; IK would get its own
copy, styled its way). Generalising that — shared seed-builders for the 17 generic
mechanisms, minting per-site masters — gives "shared functionality, per-site visuals" with
**no schema change and no shared visual components**.

## 4. Seam rules going forward

1. **New functionality lands in `@keenan/services` or `template/` — never first (or only) in
   a site.** A site file may *style* a mechanism; it may not be the sole home of one.
2. **Sites own:** look, tokens, copy, layout skins, and site-only features (membership,
   draws). **Engine owns:** actions, API routes, data access, builder rendering, spam/upload
   machinery, notification plumbing.
3. **Builder masters are per-site visuals; their seed-builders and renderer are engine.**
   Never share a master row across channels; share the code that mints and renders them.
4. **Run the drift scan on a cadence** (the script reconciles in seconds). "Template ahead
   of site" or convergent helpers are the two smells.
5. **A fix to ported code goes to every copy or to the layer below** — the IK quote
   notification gap is what skipping that costs.

## 5. Recommended sequence (not started; needs approval)

1. **Decide on accept-quote for IK** (product call, not a hotfix — see the correction in
   §2b). Porting `acceptQuote`/`duplicateQuote` + `QuoteActions` gives IK customers a way to
   accept a quote, and brings the staff alert with it. Independent of all builder work.
2. **Promote the stranded engine (§2a) into `template/`** — this *is* the IK builder port.
   After it, the IK enquiry form is content work in the designer, not engineering.
3. **Re-sync the drifted account suite + WarrantyDirectory** back into CD.
4. **Promote the convergent helpers** (§2c) into template/services.
5. Later, per Component Kit: shared seed-builders for the 17 generic masters.

## Non-goals (explicit, per Chris)

No shared visual components between sites · no schema change to `cms_components` · no
restyling of either site · nothing in this document changes behaviour by itself.
