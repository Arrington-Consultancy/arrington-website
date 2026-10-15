# Tidewell Cars: taxi website demo

The example site Arrington Consultancy shows taxi and private hire operators
on the £999 taxi website page. Tidewell Cars is a made-up firm in Exmouth.
Built from Tom's brief "BRIEF - Taxi Demo Website (Claude Code)", 15 October
2026, in Drive, and redesigned the same day after his review of the first
version.

It is exactly the £999 product: the customer-facing site and a booking form
whose bookings go into the dispatch system. Nothing office-side (controller
screens, email booking checks, phone handling) is in it, by design.

## Run it

    cd taxi-demo
    npm start          # http://localhost:3100, no dependencies to install
    npm test           # node --test (also run by the main repo's npm test)

`MOCK_CONFIRM_MS` and `MOCK_ALLOCATE_MS` change how quickly the mock
dispatch confirms a booking and allocates a car (defaults 2.5s and 7s).

## The design

Colours come from the place: the red sandstone of the cliffs at Orcombe
Point (the brand red, buttons, the mark), the blue-green of the Exe estuary
(links, the map), pale sand (the page), night for the dark bands. Headings
are Fraunces, everything else Instrument Sans; both are self-hosted latin
subsets in `public/fonts` (licences in `OFL.txt`). The one drawing that could
belong to no other firm is the map of the estuary in `lib/map.js`, built from
the same coordinates the fare engine uses.

Every photograph slot (`picture()` in `lib/html.js`) shows a painted Exmouth
scene until the real image exists, so the site looks finished either way.
`VISUALS.md` lists the eight images, their ChatGPT prompts and how to drop
one in: save the PNG as `images/<name>.png`, run
`python3 scripts/optimise-images.py` (Pillow), commit `public/img/`. The
server reads its files at start, so an image appears on the next deploy.

Motion is small and respects `prefers-reduced-motion`: the hero copy rises
on load, sections marked `.reveal` fade up as they scroll into view, and the
confirmation page's next step pulses while dispatch works.

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
  licensing body. Reviews are labelled as examples.
- Nothing typed is stored beyond two hours in memory; texts and emails are
  written to the log with numbers and addresses masked, never sent.
- No tracking and no cookies. The content security policy allows no inline
  script or style and no third party except the Google map on the contact
  page, so every font, image and script is served from here.
- Lighthouse mobile: performance, accessibility and best practices 100 on
  every page, with photographs in place. SEO reads 66 to 69 only because of
  the deliberate noindex.

## Hosting

Railway service `taxi-demo` in the Arrington project, production
environment, root directory `/taxi-demo`, watch pattern `/taxi-demo/**`,
healthcheck `/health`.
