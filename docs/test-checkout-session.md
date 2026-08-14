# Test checkout sessions

How to run a real, end-to-end card checkout on a LIVE storefront without taking
any money, and why it is built the way it is.

## The rule

**Test-ness is a property of ONE browser session. It is never stored, never a
setting, never a mode the shop can be left in.**

There used to be a stored per-channel flag (`channel_settings`
`payments_test_mode`). That is retired. A stored flag is a state a live shop can
be LEFT IN: one careless settings save, one restored backup, and the storefront
silently stops taking money with nothing on screen to say so. Nobody notices
until the takings stop.

The second rule, because these storefronts take live cards:

**Nothing here fakes a successful payment.** The test path routes to Stripe's
TEST keys and lets Stripe genuinely authorise. Stripe still decides.

## Using it

The capability is granted by a short-lived signed cookie. Get one by presenting
the server-side secret:

```bash
curl -i -c jar.txt -X POST https://<site>/api/test/checkout-session \
  -H 'content-type: application/json' -d '{"secret":"'"$TEST_CHECKOUT_SECRET"'"}'
```

Load that cookie into the browser you are testing with (or drive the whole
checkout with the same cookie jar). Then:

- the checkout mounts Stripe Elements with the **test** publishable key,
- the PaymentIntent is created on the **test** secret key,
- the payment step shows a loud TEST MODE banner listing the test cards.

Stripe's ordinary test numbers work exactly as documented, with any future expiry
and any CVC:

| Card | Behaviour |
|---|---|
| 4242 4242 4242 4242 | succeeds |
| 4000 0000 0000 0002 | declined |
| 4000 0025 0000 3155 | asks for 3D Secure |
| 4000 0000 0000 9995 | insufficient funds |

`DELETE /api/test/checkout-session` hands the capability back early. Otherwise it
expires on its own after **30 minutes** — long enough to walk a full checkout,
short enough that a forgotten tab cannot leave anyone testing tomorrow. There is
nothing to switch back.

## How it fails closed

- **No secret configured** (`TEST_CHECKOUT_SECRET` unset, which is the default):
  the endpoint 404s. The feature does not exist and no cookie can verify, because
  the secret IS the HMAC key.
- **No cookie, a forged cookie, an expired cookie, or a cookie minted for another
  storefront**: an ordinary LIVE checkout, byte for byte as today.
- **A valid test session but no test-mode Stripe gateway configured**: the
  checkout REFUSES card payment (the option is removed and the banner says so)
  rather than falling back to the live keys. `selectTestGatewayStrict` in
  `@keenan/services` exists solely to remove that fallback.

## Where it lives

| File | Role |
|---|---|
| `src/lib/checkout/test-session-token.ts` | pure HMAC sign/verify, bound to channel + purpose + expiry |
| `src/lib/checkout/test-session.ts` | the cookie layer; TTL; `hasTestCheckoutSession()` |
| `src/app/api/test/checkout-session/route.ts` | the secret-gated grant, modelled on `/api/test/login` |
| `src/lib/payments/checkout-stripe-mode.ts` | the pure test-vs-live decision |
| `src/lib/payments/gateway.ts` | thin impure adapter (reads the setting, calls the above) |
| `src/lib/actions/checkout.ts` | passes `test_mode` per call to `createStripePaymentIntent` |
| `src/components/checkout/CheckoutForm.tsx` | the banner; gated on the session flag and nothing else |

## The return path

The portal's Stripe webhook accepts events signed by either the live or the test
signing secret and then pins the gateway by the event's own `livemode`, so a test
charge is credited to its order correctly. Production has both
`STRIPE_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET_TEST` set; the test path is
dead without the latter.

Test orders are still real rows, tagged `test_mode` in metafields so the portal's
"Clear test data" can remove them.
