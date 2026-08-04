# Parity harness — does the node-tree version look identical to what's live?

Guards every page conversion: before a converted document is published, its node-tree
render must be pixel-identical to the page it replaces. A screenshot someone eyeballed is
not evidence; this is.

## How the A/B pair works

`proxy.ts` already gives every page a twin. `/json/<path>` rewrites onto the real route with
`x-kg-json: 1`, which forces the node branch and the **draft** tree, and stamps
`noindex, nofollow`:

| | |
|---|---|
| **A** | `https://site/pages/contact` — published (blocks during a migration, nodes after) |
| **B** | `https://site/json/pages/contact` — node tree, draft |

Same server, same data, same session. No staging clone, no fixtures, no header injection.

> During an IK migration A is blocks and B is nodes, so this measures *"does the conversion
> look the same"*. Once a site is fully on nodes, A is published and B is draft, so the same
> command measures *"has my draft drifted from live"*. Both are worth knowing.

## Running it

```bash
node tools/parity/parity.mjs --origin https://chefsdepot.com.au /pages/contact /
node tools/parity/parity.mjs --config tools/parity/pages.chefsdepot.json
node tools/parity/parity.mjs --origin https://x --self-check /      # A vs A
node tools/parity/parity.mjs --origin https://x --viewport desktop /  # one viewport
```

Captures at 390 / 834 / 1440 wide, full page. Writes
`tools/parity/report/<slug>-<viewport>.{a,b,diff}.png` plus `summary.json`, prints a
table, and **exits 1 if anything fails** so it can gate a publish.

## Reading the numbers

Measured on Chefs Depot, 2026-08-04:

| Run | Result | Meaning |
|---|---|---|
| A vs A, `/pages/contact` | `0%` | the noise floor is genuinely zero |
| A vs A, `/` (home) | `0.0015%` | busiest page on the site; still ~zero |
| A vs B, `/` (home) | `0.4618%` | **real** — CD's home draft differs from published |
| deliberate 8px button change | `1.13%` + size mismatch | it catches a small, realistic regression |

So the noise floor and a real change are ~300× apart, and the default `0.1%` threshold sits
between them. A page-height difference is always a failure regardless of pixel count — if
the node version is 8px taller, that *is* the regression.

**Always `--self-check` a page before trusting a failure on it.** If self-check is also
noisy, the problem is stabilisation (or a genuinely dynamic region needing a mask), not the
conversion.

## Stabilisation

`capture.mjs` freezes animations and transitions, waits for `document.fonts.ready`, scrolls
the full page to trigger lazy images and returns to the top, waits for network idle
(best-effort — a site that polls never idles), then settles. Without the scroll pass every
long page reports differences that aren't real.

## Masks

Genuinely dynamic regions — rotating carousels, live counters, "N in stock", timestamps —
are declared **per page** in a config, never globally. A global mask is how a harness
quietly stops testing the thing you care about.

```json
{
  "origin": "https://chefsdepot.com.au",
  "pages": [
    { "path": "/pages/contact" },
    { "path": "/", "masks": [".stats-banner", "[data-carousel]"] }
  ]
}
```

Prefer a stable hook (`data-*` attribute, semantic class) over a utility-class chain, which
will break the moment someone restyles.

## The review step

A numeric threshold cannot tell *"the hero shifted 3px"* from *"the carousel is on a
different slide"*. So per converted document:

1. Run `parity.mjs` for that page.
2. A subagent **reads the diff PNGs** and returns a verdict — pass, or the regions that
   differ with a judgement on each (real regression vs legitimately dynamic).
3. A fail blocks the publish. A "dynamic" verdict becomes a mask entry in the config, with
   the reason recorded, so the next run is quiet for a stated reason rather than by accident.

The diff images are built for this: changed pixels are red, and everything that shifted
below a change lights up too, which is what makes a layout shift obvious at a glance.
