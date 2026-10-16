# Tidewell Cars: taxi website demo

The example site Arrington Consultancy shows taxi and private hire operators
on the £999 taxi website page. Tidewell Cars is a made-up firm in Exmouth
that runs both hackney carriage taxis and private hire cars from one control
room. Built from Tom's brief "BRIEF - Taxi Demo Website (Claude Code)", 15
October 2026, in Drive, redesigned twice the same day after his reviews.

It is exactly the £999 product: the customer-facing site and a booking form
whose bookings go into the dispatch system. Nothing office-side (controller
screens, email booking checks, phone handling) is in it, by design.

One page looks behind it: `/staff-portal` (16 October 2026) shows the
Tidewell office, Arrington's AI workspace example, in screenshots, with a
Staff login button to `/taxi-demo/office/`. The office itself is served by
the main site (`routes/taxiOffice.js`) and needs an invited login; the
screenshots live in `public/img/office-*` and were cut with
`scripts/optimise-images.py` from captures of the office with the replies as
the AI drafted them on production that morning.

## Run it

    cd taxi-demo
    npm start          # http://localhost:3100, no dependencies to install
    npm test           # node --test (also run by the main repo's npm test)

`MOCK_CONFIRM_MS` and `MOCK_ALLOCATE_MS` change how quickly the mock
dispatch confirms a booking and allocates a car (defaults 2.5s and 7s).

## The design

One typeface, Schibsted Grotesk, self-hosted as a single latin woff2 in
`public/fonts` (licence in `OFL.txt`). Nothing on the site is set in a serif.
Figures are lining everywhere and tabular wherever a price, a time or a
reference is read, because prices are this site's content. Colours come from
the place: red sandstone for the firm and its buttons, the estuary teal for
links and water, sand for the page, and a night field that works like a
dispatch board (the fixed-price strip, the fare block, the confirmation).

The price is the hero. A fare block (label, figure, one line of context)
appears on the home card and on `/book` the moment both ends are typed, and
counts up like a meter; the home page also carries a fixed-price strip. The
one drawing that could belong to no other firm is the map of the estuary in
`lib/map.js`, built from the same coordinates the fare engine uses; it is
the "Where we go" map and the picture on the page not found.

Every page opens with its own headline. The demo ribbon is one line on a
phone and the full sentence on a wider screen. At iPhone 13 size the home
page's From field is on the first screen above the fixed Call / Book bar,
which stands down while the form is in view.

### The pictures

Eight AI-generated illustrations, not photographs of a real fleet, and every
page's footer says so. Tom keeps the originals in Drive; only the web sizes
in `public/img` are in git. `VISUALS.md` has the list, where each one is
used, and how to regenerate the web files:

    TAXI_IMAGES_SRC=/path/to/the/originals python3 taxi-demo/scripts/optimise-images.py

The pictures show the firm's taxis (roof lights). Copy beside a pictured car
never calls it private hire, and no real council is named as the licensing
body.

Motion is small and respects `prefers-reduced-motion`: the hero copy rises
on load, sections marked `.reveal` fade up as they scroll into view, the fare
counts up, and the confirmation page's next step pulses while dispatch works.

## How a booking travels

    form (/book) -> lib/booking.js readBooking (validation, price)
                 -> lib/booking.js toDispatch (the shape every driver gets)
                 -> lib/dispatch/<driver>.js createBooking -> dispatch's own ref
    /booking/<token> polls /api/bookings/<token> -> driver.getBooking

`DISPATCH_DRIVER` picks the driver (default `mock`). The iCabbi, Autocab and
Cordic files are slots that refuse every call until written against that
vendor's booking API, with the operator's access arranged. Write one, keep the
return shapes in `lib/dispatch/index.js`, and it must pass
`test/dispatch.test.js`.

## Rules this site keeps

- Every page says it is a demonstration and no car will come, and carries
  `noindex`: a fictional firm must never sit in search results.
- Phone numbers are Ofcom drama numbers (01632 960xxx, 07700 900xxx).
- No real council, hospital, school, hotel or company is named as a client or
  licensing body. Reviews are labelled as examples. The pictures are labelled
  as AI-generated illustrations.
- Nothing typed is stored beyond two hours in memory; texts and emails are
  written to the log with numbers and addresses masked, never sent.
- No tracking and no cookies. The content security policy allows no inline
  script or style and no third party except the Google map on the contact
  page, so every font, image and script is served from here.
- Lighthouse mobile: performance, accessibility and best practices 95 or
  above on every page, with the pictures in place. SEO reads about 66 only
  because of the deliberate noindex.
- `test/design.test.js` pins the design rules: no serif, one self-hosted
  face, a distinct h1 on every page, nothing inline, honest alt text.

## Hosting

Part of Arrington's main site since 15/10/2026, at
https://www.arringtonconsultancy.com/taxi-demo/ (Tom: the demo's address
should be the main website's, with no domain of its own). The main site's
`server.js` calls `createApp({ basePath: '/taxi-demo' })` and hands requests
to `server.handle`, mounted after its HTTPS and host redirect and before its
helmet, session, body parsers and CSRF check, so the demo keeps its own CSP,
noindex, gzip and form checks and sets no cookie. Every address a page
writes goes through `link()` in `lib/base.js`; `test/basePath.test.js` fails
if one escapes the path.

Run on its own (`npm start`, or `BASE_PATH=/taxi-demo npm start` to try the
path locally), it behaves as before.

The Railway service `taxi-demo` (production only, root `/taxi-demo`, watch
`/taxi-demo/**`, healthcheck `/health`) now only forwards its old address,
taxi-demo-production.up.railway.app, to the new one: `REDIRECT_TO` is set on
it, and every request but `/health` gets a 301 with its path kept.
