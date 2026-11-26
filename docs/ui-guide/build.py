#!/usr/bin/env python3
"""Assemble docs/ui-guide/index.html from src.html and the screenshots.

Usage: python3 -I docs/ui-guide/build.py

1. Downscales shots/*.png (780x1520) to embedded/*.jpg (390 px wide, JPEG q85) with ImageMagick,
   when the JPEG is missing or older than the PNG.
2. Replaces every {{shot:NAME}} in src.html with a data: URI of embedded/NAME.jpg.
"""
import base64
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
SHOTS = HERE / "shots"
EMB = HERE / "embedded"


def downscale():
    EMB.mkdir(exist_ok=True)
    for png in sorted(SHOTS.glob("*.png")):
        jpg = EMB / (png.stem + ".jpg")
        if not jpg.exists() or jpg.stat().st_mtime < png.stat().st_mtime:
            subprocess.run(["magick", str(png), "-resize", "390x", "-quality", "85", str(jpg)], check=True)


def build():
    src = (HERE / "src.html").read_text()
    missing = []

    def sub(m):
        jpg = EMB / (m.group(1) + ".jpg")
        if not jpg.exists():
            missing.append(m.group(1))
            return ""
        return "data:image/jpeg;base64," + base64.b64encode(jpg.read_bytes()).decode()

    out = re.sub(r"\{\{shot:([\w-]+)\}\}", sub, src)
    if missing:
        sys.exit(f"missing screenshots: {missing}")
    (HERE / "index.html").write_text(out)
    print(f"index.html: {len(out) / 1024:.0f} KB")


if __name__ == "__main__":
    downscale()
    build()
