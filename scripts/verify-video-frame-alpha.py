"""Verify every exported PNG in a frame ZIP has the expected background/subject alpha."""
import argparse
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--frames', type=int, required=True)
    parser.add_argument('--background-alpha', type=int, default=0)
    args = parser.parse_args()
    with ZipFile(args.archive) as archive:
        names = [name for name in archive.namelist() if name.lower().endswith('.png')]
        if len(names) != args.frames:
            raise SystemExit(f'Expected {args.frames} PNG frames, found {len(names)}')
        for name in names:
            image = Image.open(BytesIO(archive.read(name))).convert('RGBA')
            if image.getpixel((0, 0))[3] != args.background_alpha:
                raise SystemExit(f'{name}: unexpected background alpha')
            if image.getpixel((image.width // 2, image.height // 2))[3] != 255:
                raise SystemExit(f'{name}: center subject is not opaque')
    print(f'PASS: {len(names)} PNG frames; background alpha {args.background_alpha}; opaque center subject')


if __name__ == '__main__':
    main()
