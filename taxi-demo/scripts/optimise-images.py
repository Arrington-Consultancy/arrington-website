#!/usr/bin/env python3
"""Cut the site's image sizes from the originals.

    TAXI_IMAGES_SRC=/path/to/originals python3 taxi-demo/scripts/optimise-images.py
    TAXI_IMAGES_SRC=/path/to/originals python3 taxi-demo/scripts/optimise-images.py hero-exmouth

The originals (Tom's eight PNGs) live in Drive, not in git: download the
folder, point TAXI_IMAGES_SRC at it and run this once. For each <name>.png
(or .jpg) it writes taxi-demo/public/img/<name>-<width>.webp and .jpg at
480, 768, 1200, 1600 and 2400 pixels wide (never wider than the original),
plus the original's own width when that is under 1600 (a 1536 wide original
gets a 1536 file, so it stays sharp on a 1440 wide screen), plus a manifest
with each original's size so the pages can set width and height and avoid
layout shift. Files already newer than their original are skipped. Commit
public/img, never the originals.

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
NATIVE_BELOW = 1600
WEBP_QUALITY = 80
JPEG_QUALITY = 78


def originals(only=None):
    if not os.path.isdir(SRC):
        sys.exit(f'No originals folder at {SRC}. Download them from Drive and set TAXI_IMAGES_SRC (see VISUALS.md).')
    names = sorted(f for f in os.listdir(SRC) if f.lower().endswith(('.png', '.jpg', '.jpeg')))
    if only:
        names = [f for f in names if os.path.splitext(f)[0] in only]
    return names


def sizes_for(width):
    sizes = [w for w in WIDTHS if w <= width]
    if width < NATIVE_BELOW and width not in sizes:
        sizes.append(width)
    return sizes or [width]


def cut(path, name):
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert('RGB')
        width, height = im.size
        made = []
        for w in sizes_for(width):
            target_h = round(height * w / width)
            resized = im if w == width else im.resize((w, target_h), Image.LANCZOS)
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
