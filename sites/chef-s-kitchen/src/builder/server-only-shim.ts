// Test-only stand-in for the `server-only` marker package, which Next provides
// at build time but is not installed as a real dependency. `product-natives.test.ts`
// redirects `import "server-only"` here so the native's real component graph can
// load under node:test. Intentionally empty — the real package is a poison-pill
// marker with no runtime behaviour either.
export {};
