# Tidewell Cars: taxi website demo

The example site Arrington Consultancy shows taxi and private hire operators
on the £999 taxi website page. Tidewell Cars is a made-up firm in Exmouth.
Built from Tom's brief "BRIEF - Taxi Demo Website (Claude Code)", 15 October
2026, in Drive.

It is exactly the £999 product: the customer-facing site and a booking form
whose bookings go into the dispatch system. Nothing office-side (controller
screens, email booking checks, phone handling) is in it, by design.

## Run it

    cd taxi-demo
    npm start          # http://localhost:3100, no dependencies to install
    npm test           # node --test (also run by the main repo's npm test)

`MOCK_CONFIRM_MS` and `MOCK_ALLOCATE_MS` change how quickly the mock
dispatch confirms a booking and allocates a car (defaults 2.5s and 7s).

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
- No tracking and no cookies.

## Hosting

Railway service `taxi-demo` in the Arrington project, production
environment, root directory `/taxi-demo`, watch pattern `/taxi-demo/**`,
healthcheck `/health`.
