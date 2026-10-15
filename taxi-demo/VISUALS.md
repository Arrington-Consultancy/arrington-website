# Visuals for the Tidewell Cars demo

Eight AI-generated illustrations, made in ChatGPT from the prompts below,
reviewed and corrected (two mirrored so the cars drive on the left, one roof
sign cleaned of garbled lettering) and in use on the site since 15 October
2026. They are illustrations, not photographs of a real fleet, and the
footer of every page says so.

## Where the originals live, and how to regenerate the web files

The originals (PNG, 1536 x 1024, the driver portrait 1024 x 1536) are in
Tom's Drive folder
https://drive.google.com/drive/folders/1p_kvjqLL8Yl_0ICV67iXh2Z6g7wRaHnD.
They are not in git: only the web sizes in `taxi-demo/public/img` are.

To regenerate the web files (after replacing a picture, or on a fresh
machine), download the folder and run, from the repository root:

    TAXI_IMAGES_SRC=/path/to/the/downloaded/folder python3 taxi-demo/scripts/optimise-images.py

It needs Python 3 with Pillow (`pip install pillow`). For every original it
writes WebP and JPEG at 480, 768 and 1200 pixels wide, plus the original's
own width when that is under 1600 (so a 1536 wide picture stays sharp on a
1440 wide screen), into `taxi-demo/public/img/`, with a `manifest.json` of
each original's size so the pages can set width and height and nothing
shifts as a picture loads. One at a time:
`TAXI_IMAGES_SRC=... python3 taxi-demo/scripts/optimise-images.py hero-exmouth`.
Commit `public/img` and push; the server reads its files when it starts, so
a picture changes on the next deploy. No code changes: each slot looks for
`public/img/<name>-*.webp` and shows the picture when it exists.

## The eight pictures and where each is used

| File | Used | Shown as |
|---|---|---|
| `hero-exmouth` | Home page opening | Desktop: full width behind the headline and the booking card, the car clear of both, lower left of centre. Phone: a 2:1 strip above the headline, cropped at 35% across so the car stays in view. |
| `airport-night` | Airports page opening; home page "Fixed prices, day or night" | Airports: full width behind the headline (21:9 on a desktop). Home: 4:3. |
| `accounts` | Business accounts page opening; home page "One invoice a month" | Accounts: full width behind the headline. Home: 4:3. |
| `wav` | About page, "Six cars with a ramp" | 4:3 |
| `fleet-dawn` | About page, the wide band under the headline and the stats | 21:9 on a desktop, 4:3 on a phone, centred |
| `driver` | About page, "Drive with us" | Upright, 2:3 |
| `estuary-sand` | Home page, the band behind the "Where we go" map | A wide strip, about 3:1, with the map card overlapping it |
| `huts-evening` | Contact page opening | Full width behind the headline |

Dropped from nowhere: all eight are in use. The page not found keeps the
estuary map rather than a picture, on purpose.

If a picture is replaced, keep the subject clear of the edges that get cut
(the column on the right), and keep the same file name.

## The prompts the set was made from

Paste this block at the end of every prompt. It is the same each time.

> Photorealistic, like a photograph from a professional camera, not an
> illustration. Set in Exmouth, East Devon, England (or on an ordinary UK
> road or at a UK regional airport where the prompt says so). Any car is a
> plain, unmarked, right-hand-drive UK car driving on the left. No number
> plates at all: the plate is out of frame, hidden or blank. No text, no
> logos, no lettering, no signs with writing, anywhere in the image. No
> London black cabs and no London landmarks. No identifiable faces: people
> are seen from behind, at a distance, or only their hands. Natural light:
> late afternoon, warm highlights, soft cool shadows, slightly muted colour,
> like Kodak Portra film. No lens flare, no HDR, no vignette.

Why: lettering from image models comes out garbled, so the site adds any
name or livery itself; plates and faces must not belong to anyone real; the
rest keeps the set looking like one shoot. The set as delivered carries
plain taxi roof lights on every car, which is why the site presents the
pictured cars as the firm's taxis.

Ask for the largest landscape (3:2) image on offer, 1536 x 1024 or bigger.
Only the driver portrait is upright (2:3).

1. `hero-exmouth`: A plain white hybrid saloon car driving along the
   seafront road at Exmouth, Devon, seen from slightly behind and to the
   side, heading away from the camera on the left of the road. Late
   afternoon golden light. Beyond the car: the wide sandy beach, the calm
   blue-green water of the Exe estuary, and in the distance the red
   sandstone cliffs of Orcombe Point glowing in the sun. A few people far
   away on the sand, seen from behind. The lower left of the frame is empty
   road in soft shadow.
2. `airport-night`: A plain silver estate car at the drop-off kerb outside a
   small UK regional airport terminal at night, seen from the rear
   three-quarter. Tail lights on, the terminal's glass front softly lit
   behind, a wet road reflecting the lights. A person seen from behind
   lifting a suitcase from the open boot.
3. `accounts`: Outside a small seaside hotel in Devon on a bright late
   afternoon: a plain grey saloon car waiting at the kerb with its rear door
   open, and a guest seen from behind walking towards it with a wheeled
   suitcase. A doorway with a few steps and a planted pot, pale painted
   render.
4. `wav`: A plain white wheelchair accessible vehicle, a tall UK people
   carrier with its rear ramp lowered to the pavement, parked on a quiet
   residential street in Exmouth, Devon. A wheelchair user seen from behind
   at the foot of the ramp, and the driver's hands steadying the chair. Red
   brick and pale render houses, a hedge, late afternoon light.
5. `fleet-dawn`: Early morning on the seafront at Exmouth, Devon: a row of
   plain white and silver saloon cars parked nose to tail along the
   promenade, a line of painted beach huts behind them, the sea calm and
   pale, low sun and long shadows. Nobody about.
6. `driver`: Inside a car, over the driver's shoulder: a driver's hands on
   the steering wheel of a right-hand-drive car, the dashboard plain and
   unlit, the windscreen showing a quiet coast road along the Exe estuary in
   late afternoon light. The driver's face is not visible. Portrait, 2:3.
7. `estuary-sand`: Looking straight down from above at the Exe estuary near
   Exmouth at low tide: ribbed wet sand, shallow channels of blue-green water
   catching the light, the pattern repeating across the whole frame. No
   people, no boats, no land.
8. `huts-evening`: A row of painted wooden beach huts on the promenade at
   Exmouth, Devon, at dusk, the sky turning from gold to blue, the sea
   beyond, a couple of people far away walking on the sand seen from behind.

## If a picture comes out wrong

- Lettering on a building, sign or car: ask again with "absolutely no text,
  letters, numbers or signs anywhere in the image".
- A number plate with characters: "the number plate is blank with nothing
  on it", or blank it in any image editor before saving.
- Left-hand drive or driving on the right: "British right-hand-drive car on
  the left side of the road, steering wheel on the right", or mirror the
  image if nothing else in it gives the mirroring away.
- A face: "seen from behind, face not visible".
- Too saturated or too dark: "soft natural light, muted colours, no HDR".
