# Visual smoke checks

Run `npm run dev -- --port 3007` and then `npm run test:visual`.
Chrome must be installed. `TEST_ORIGIN` may select a different localhost port;
remote origins are rejected. Screenshots go to the OS temporary directory under
`xpacebox-visual` (or `TEST_OUTPUT`).

These checks use the real React components with synthetic, browser-intercepted
API responses. They do not verify the production database or real authentication.
External requests and writes are intercepted, so no contacts, calls, quotes or
users are created. Only the public Supabase URL is read to name the test session.

Coverage includes desktop/mobile module navigation, a restricted role, the
welcome animation and reduced motion, products with accessories, pricing steps,
CRM, report category colors, user forms, central and login. Viewport overflow and
JavaScript errors fail the run. Inspect the resulting screenshots as well.
