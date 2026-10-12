# Fonts

Playable text uses **Noto Serif SC Medium** (Source Han Serif SC, weight 500) for Chinese and Latin.

| File | Role |
| --- | --- |
| `NotoSerifSC-Medium-subset.otf` | Godot theme default `FontFile` |
| `../build/web/fonts/NotoSerifSC-Medium-subset.woff2` | HTML `@font-face` 500 |

CSS stack: `'Noto Serif SC', 'Noto Sans SC', serif`.

Noto Sans SC is **not** bundled. The Serif Medium subset already covers the remake’s copy (CJK + Latin). Shipping a second CJK webfont (~200 KB) for glyphs that should not appear is not worth it. The `Noto Sans SC` name only matches a font the visitor already has installed; otherwise the generic `serif` fallback is used.

SIL Open Font License 1.1 (`OFL-NotoSerifSC.txt`). Rebuild:

```bash
python3 tools/subset_cjk_font.py /path/to/NotoSerifSC-Medium.otf
```
