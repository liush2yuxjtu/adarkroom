#!/usr/bin/env python3
"""Subset Noto Serif SC Medium to glyphs used by the remake (SIL OFL).

Reads copy from godot/data, scripts, and the committed HTML runtime,
then writes a compact OTF (Godot FontFile) and WOFF2 (web @font-face).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
GODOT_FONTS = ROOT / "fonts"
WEB_FONTS = ROOT / "build" / "web" / "fonts"
EXTRA = "…—–‘’“”·•※°—－～、。！？：；（）【】《》「」『』±×÷"
ASCII = "".join(chr(i) for i in range(0x20, 0x7F))


def collect_glyphs() -> str:
    blob: list[str] = [EXTRA, ASCII]
    roots = [ROOT / "data", ROOT / "scripts", ROOT / "build" / "web", ROOT / "scenes"]
    for base in roots:
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.suffix.lower() not in {".gd", ".js", ".html", ".json", ".css", ".md"}:
                continue
            try:
                blob.append(p.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError):
                continue
    chars = {
        ch
        for text in blob
        for ch in text
        if (
            0x20 <= ord(ch) <= 0x7E
            or 0xA0 <= ord(ch) <= 0x24F
            or 0x2000 <= ord(ch) <= 0x206F
            or 0x3000 <= ord(ch) <= 0x303F
            or 0x3400 <= ord(ch) <= 0x4DBF
            or 0x4E00 <= ord(ch) <= 0x9FFF
            or 0xF900 <= ord(ch) <= 0xFAFF
            or 0xFF00 <= ord(ch) <= 0xFFEF
            or ch in EXTRA
        )
    }
    return "".join(sorted(chars))


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/adr-fonts/src/NotoSerifSC-Medium.otf")
    if not src.is_file():
        print("missing source font:", src, file=sys.stderr)
        return 1
    glyphs = collect_glyphs()
    GODOT_FONTS.mkdir(parents=True, exist_ok=True)
    WEB_FONTS.mkdir(parents=True, exist_ok=True)
    glyph_file = TOOLS / "cjk-glyphs.txt"
    glyph_file.write_text(glyphs, encoding="utf-8")
    otf = GODOT_FONTS / "NotoSerifSC-Medium-subset.otf"
    woff2 = WEB_FONTS / "NotoSerifSC-Medium-subset.woff2"
    common = [
        "pyftsubset",
        str(src),
        f"--text-file={glyph_file}",
        "--layout-features=*",
        "--glyph-names",
        "--symbol-cmap",
        "--legacy-cmap",
        "--notdef-glyph",
        "--notdef-outline",
        "--recommended-glyphs",
        "--name-IDs=*",
        "--name-legacy",
        "--name-languages=*",
        "--drop-tables+=FFTM",
    ]
    subprocess.check_call(common + [f"--output-file={otf}"])
    subprocess.check_call(common + [f"--output-file={woff2}", "--flavor=woff2", "--desubroutinize"])
    print(f"glyphs={len(glyphs)} otf={otf.stat().st_size} woff2={woff2.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
