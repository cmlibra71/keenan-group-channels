import test from "node:test";
import assert from "node:assert/strict";
import { legacyProbes, newStyleAddress } from "./legacy-address";

test("a root-level address could be a product, a category or a page — in that order", () => {
  assert.deepEqual(legacyProbes("/roband-dm31w"), [
    { kind: "product", slug: "roband-dm31w" },
    { kind: "category", slug: "roband-dm31w" },
    { kind: "page", slug: "roband-dm31w" },
  ]);
});

test("a nested address was a category path, so only its last segment is asked about", () => {
  assert.deepEqual(legacyProbes("/catering-equipment/benchtop-equipment/commercial-toasters"), [
    { kind: "category", slug: "commercial-toasters" },
    { kind: "product", slug: "commercial-toasters" },
  ]);
});

test("Zoey's numeric disambiguator is tried without it as a last resort", () => {
  const probes = legacyProbes("/catering-equipment/combi-ovens-4");
  assert.deepEqual(probes[probes.length - 1], { kind: "category", slug: "combi-ovens" });
});

test("the site root asks nothing", () => {
  assert.deepEqual(legacyProbes("/"), []);
  assert.deepEqual(legacyProbes(""), []);
});

test("Zoey's doubled hyphen — an ampersand that became an empty word — is collapsed", () => {
  const probes = legacyProbes("/commercial-kitchen-equipment/commercial-kitchenware/scales--timers");
  assert.deepEqual(probes, [
    { kind: "category", slug: "scales--timers" },
    { kind: "product", slug: "scales--timers" },
    { kind: "category", slug: "scales-timers" },
  ]);
});

test("a root-level doubled-hyphen address still asks about the product and the page first", () => {
  assert.deepEqual(legacyProbes("/sinks--basins"), [
    { kind: "product", slug: "sinks--basins" },
    { kind: "category", slug: "sinks--basins" },
    { kind: "page", slug: "sinks--basins" },
    { kind: "category", slug: "sinks-basins" },
  ]);
});

test("a numeric suffix and a doubled hyphen are also tried together", () => {
  const slugs = legacyProbes("/catering-equipment/sinks--basins-4").map((p) => p.slug);
  assert.deepEqual(slugs, ["sinks--basins-4", "sinks--basins-4", "sinks--basins", "sinks-basins-4", "sinks-basins"]);
});

test("an ordinary slug gains no extra probes", () => {
  assert.deepEqual(legacyProbes("/catering-equipment/commercial-toasters"), [
    { kind: "category", slug: "commercial-toasters" },
    { kind: "product", slug: "commercial-toasters" },
  ]);
});

test("each probe knows its new-style address", () => {
  assert.equal(newStyleAddress({ kind: "product", slug: "x" }), "/products/x");
  assert.equal(newStyleAddress({ kind: "category", slug: "x" }), "/categories/x");
  assert.equal(newStyleAddress({ kind: "page", slug: "x" }), "/pages/x");
});
