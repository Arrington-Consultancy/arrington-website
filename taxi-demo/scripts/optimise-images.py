#!/usr/bin/env python3
"""Cut the site's image sizes from the originals in taxi-demo/images/.

    python3 taxi-demo/scripts/optimise-images.py            # every image
    python3 taxi-demo/scripts/optimise-images.py hero-exmouth  # one image

For each <name>.png (or .jpg) in taxi-demo/images/ it writes
taxi-demo/public/img/<name>-<width>.webp and .jpg at 480, 768, 1200, 1600
and 2400 pixels wide (never wider than the original), plus a manifest with
each original's size so the pages can set width and height and avoid layout
shift. Files already newer than their original are skipped.

Needs Python 3 and Pillow (pip install pillow). Nothing else.
"""
import json
import os
import sys

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    sys.exit('Pillow is not installed: pip install pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get('TAXI_IMAGES_SRC') or os.path.join(ROOT, 'images')
OUT = os.environ.get('TAXI_IMAGES_OUT') or os.path.join(ROOT, 'public', 'img')
WIDTHS = [480, 768, 1200, 1600, 2400]
WEBP_QUALITY = 80
JPEG_QUALITY = 78


def originals(only=None):
    if not os.path.isdir(SRC):
        sys.exit(f'No originals folder at {SRC}. Put the PNGs there first (see VISUALS.md).')
    names = sorted(f for f in os.listdir(SRC) if f.lower().endswith(('.png', '.jpg', '.jpeg')))
    if only:
        names = [f for f in names if os.path.splitext(f)[0] in only]
    return names


def cut(path, name):
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert('RGB')
        width, height = im.size
        made = []
        for w in WIDTHS:
            if w > width and w != WIDTHS[0]:
                continue
            target_w = min(w, width)
            target_h = round(height * target_w / width)
            resized = im if target_w == width else im.resize((target_w, target_h), Image.LANCZOS)
            for ext, kwargs in (('webp', {'quality': WEBP_QUALITY, 'method': 6}), ('jpg', {'quality': JPEG_QUALITY, 'optimize': True, 'progressive': True})):
                out = os.path.join(OUT, f'{name}-{w}.{ext}')
                if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(path):
                    continue
                resized.save(out, **kwargs)
                made.append(os.path.basename(out))
        return width, height, made


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, 'manifest.json')
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)
    only = set(argv) or None
    for file in originals(only):
        name = os.path.splitext(file)[0]
        width, height, made = cut(os.path.join(SRC, file), name)
        manifest[name] = {'width': width, 'height': height}
        print(f'{name}: {width}x{height}, {len(made)} file(s) written' if made else f'{name}: up to date')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write('\n')


if __name__ == '__main__':
    main(sys.argv[1:])
