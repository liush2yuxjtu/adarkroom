#!/usr/bin/env python3
"""Subset Noto Sans SC to glyphs used by the remake (SIL OFL).

Reads Chinese copy from godot/data, scripts, and the committed HTML runtime,
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
EXTRA = "…—–‘’“”·•※°—－～、。！？：；（）【】《》「」『』"


def collect_glyphs() -> str:
    blob: list[str] = [EXTRA]
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
            "\u3000" <= ch <= "\u303f"
            or "\u3400" <= ch <= "\u4dbf"
            or "\u4e00" <= ch <= "\u9fff"
            or "\uf900" <= ch <= "\ufaff"
            or "\uff00" <= ch <= "\uffef"
            or ch in EXTRA
        )
    }
    return "".join(sorted(chars))


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/adr-fonts/NotoSansSC-Regular.otf")
    if not src.is_file():
        print("missing source font:", src, file=sys.stderr)
        return 1
    glyphs = collect_glyphs()
    GODOT_FONTS.mkdir(parents=True, exist_ok=True)
    WEB_FONTS.mkdir(parents=True, exist_ok=True)
    glyph_file = TOOLS / "cjk-glyphs.txt"
    glyph_file.write_text(glyphs, encoding="utf-8")
    otf = GODOT_FONTS / "NotoSansSC-Regular-subset.otf"
    woff2 = WEB_FONTS / "NotoSansSC-Regular-subset.woff2"
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
