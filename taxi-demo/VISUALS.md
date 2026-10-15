# Visuals for the Tidewell Cars demo

Eight photographs, generated in ChatGPT, drop into this site by file name.
Until a file exists its slot shows a designed fallback (a painted Exmouth
landscape in the site's colours), so the site looks finished either way.

## The look, in one paragraph

Tidewell Cars is a confident local firm in Exmouth: 48 plain white, silver
and grey cars, running since 2004. The site's colours come from the place:
the red sandstone of the cliffs at Orcombe Point, the blue-green of the Exe
estuary, pale sand. Every photograph should feel like one afternoon in East
Devon shot by the same photographer: late, warm light, soft cool shadows,
a little muted (think a Kodak Portra film look), never neon, never HDR.

## Rules for every image

Paste this block at the end of every prompt. It is the same each time.

> Photorealistic, like a photograph from a professional camera, not an
> illustration. Set in Exmouth, East Devon, England (or on an ordinary UK
> road or at a UK regional airport where the prompt says so). Any car is a
> plain, unmarked, right-hand-drive UK car driving on the left. No number
> plates at all: the plate is out of frame, hidden or blank. No text, no
> logos, no lettering, no signs with writing, no roof signs, anywhere in the
> image. No London black cabs and no London landmarks. No private hire car
> carries a "TAXI" roof sign. No identifiable faces: people are seen from
> behind, at a distance, or only their hands. Natural light: late afternoon,
> warm highlights, soft cool shadows, slightly muted colour, like Kodak
> Portra film. No lens flare, no HDR, no vignette.

Why: lettering from image models comes out garbled, so the site adds any
name or livery itself; plates and faces must not belong to anyone real; the
rest keeps the set looking like one shoot.

## Sizes

Ask ChatGPT for the largest landscape (3:2) image it will give, 1536 x 1024
or bigger; 2400 wide is ideal. Only the driver portrait is upright (2:3).
The script below cuts every size the site needs, so one image per slot is
enough. The "shown as" column is how the site crops it: keep the subject
clear of the edges that get cut.

## The eight images

### 1. `hero-exmouth` (home page hero, the most important one)

Shown as: full width, 16:9 on a desktop, 4:5 on a phone (the sides are
cropped on a phone, so keep the car near the centre). The headline sits over
the bottom left quarter, so that corner should be quiet: road, sand or
shadow, not detail.

> A plain white hybrid saloon car driving along the seafront road at Exmouth,
> Devon, seen from slightly behind and to the side, heading away from the
> camera on the left of the road. Late afternoon golden light. Beyond the
> car: the wide sandy beach, the calm blue-green water of the Exe estuary,
> and in the distance the red sandstone cliffs of Orcombe Point glowing in
> the sun. A few people far away on the sand, seen from behind. The lower
> left of the frame is empty road in soft shadow. Landscape, 3:2.

### 2. `airport-night` (home page fixed prices; airports page)

Shown as: 4:3.

> A plain silver estate car at the drop-off kerb outside a small UK regional
> airport terminal at night, seen from the rear three-quarter. Tail lights
> on, the terminal's glass front softly lit behind, a wet road reflecting the
> lights. A person seen from behind lifting a suitcase from the open boot.
> No lettering on the building, no signs, no plates. Cool blue night with
> warm light from the terminal. Landscape, 3:2.

### 3. `accounts` (home page business accounts; accounts page)

Shown as: 4:3.

> Outside a small seaside hotel in Devon on a bright late afternoon: a plain
> grey saloon car waiting at the kerb with its rear door open, and a guest
> seen from behind walking towards it with a wheeled suitcase. A doorway with
> a few steps and a planted pot, pale painted render, no sign and no
> lettering. Warm light, soft shadows. Landscape, 3:2.

### 4. `wav` (about page; airports page note on wheelchair users)

Shown as: 4:3.

> A plain white wheelchair accessible vehicle, a tall UK people carrier with
> its rear ramp lowered to the pavement, parked on a quiet residential street
> in Exmouth, Devon. A wheelchair user seen from behind at the foot of the
> ramp, and the driver's hands steadying the chair. Red brick and pale render
> houses, a hedge, late afternoon light. No plates, no lettering, no roof
> sign. Landscape, 3:2.

### 5. `fleet-dawn` (about page header; contact page)

Shown as: a wide band, about 21:9 on a desktop and 4:3 on a phone, so keep
the interesting part in the middle of the frame.

> Early morning on the seafront at Exmouth, Devon: a row of plain white and
> silver saloon cars parked nose to tail along the promenade, a line of
> painted beach huts behind them, the sea calm and pale, low sun from the
> left and long shadows. Nobody about. No plates, no lettering, no roof
> signs. Landscape, 3:2.

### 6. `driver` (about page, drive with us)

Shown as: upright, 4:5.

> Inside a car, over the driver's shoulder: a driver's hands on the steering
> wheel of a right-hand-drive car, the dashboard plain and unlit, the
> windscreen showing a quiet coast road along the Exe estuary in late
> afternoon light. The driver's face is not visible. No screens with text,
> no logos. Portrait, 2:3.

### 7. `estuary-sand` (home page, behind the "where we go" map)

Shown as: a very wide band, about 3:1, with text over it, so it should be
calm and even with no single point of interest.

> Looking straight down from above at the Exe estuary near Exmouth at low
> tide: ribbed wet sand, shallow channels of blue-green water catching the
> light, the pattern repeating across the whole frame. No people, no boats,
> no land. Soft late afternoon light, muted colour. Landscape, 3:2.

### 8. `huts-evening` (optional: contact page and the page not found page)

Shown as: 4:3.

> A row of painted wooden beach huts on the promenade at Exmouth, Devon, at
> dusk, the sky turning from gold to blue, the sea beyond, a couple of people
> far away walking on the sand seen from behind. No lettering on the huts.
> Landscape, 3:2.

## Dropping an image in

1. Save the PNG from ChatGPT as `taxi-demo/images/<name>.png` (for example
   `taxi-demo/images/hero-exmouth.png`). That folder holds the originals.
2. From the repository root run

       python3 taxi-demo/scripts/optimise-images.py

   It needs Python 3 with Pillow (`pip install pillow`). For every original
   it writes WebP and JPEG versions at 480, 768, 1200, 1600 and 2400 pixels
   wide into `taxi-demo/public/img/`, skipping any that are already up to
   date. One image at a time: `python3 taxi-demo/scripts/optimise-images.py hero-exmouth`.
3. Commit both folders and push. The site reads its files when it starts,
   so the picture appears on the next deploy (or restart locally). No code
   changes: each slot looks for `public/img/<name>-1200.webp` and shows the
   photograph when it exists, the painted fallback when it does not.

Without Pillow, the one-line equivalent for a single size is

    python3 -c "from PIL import Image; im=Image.open('taxi-demo/images/hero-exmouth.png').convert('RGB'); im.thumbnail((1200, 9999)); im.save('taxi-demo/public/img/hero-exmouth-1200.webp', quality=80)"

but the script is the one that makes every size, which is what keeps the
phone download small.

## If an image comes out wrong

Common problems and the fix:

- Lettering on a building, sign or car: ask again with "absolutely no text,
  letters, numbers or signs anywhere in the image".
- A number plate: "the number plate is blank white with nothing on it" or
  crop it out in any image editor before saving.
- Left-hand drive or driving on the right: "British right-hand-drive car on
  the left side of the road, steering wheel on the right".
- A face: "seen from behind, face not visible".
- Too saturated or too dark: "soft natural light, muted colours, no HDR".
