# Fonts

Playable text uses **JetBrains Mono** for Latin, digits and punctuation, with **Noto Sans SC** (Source Han Sans SC) for CJK.

| File | Role |
| --- | --- |
| `JetBrainsMono-Regular.ttf` | Godot theme default `FontFile` |
| `NotoSansSC-Regular-subset.otf` | Godot `FontFile` fallback (glyphs used by the remake) |
| `../build/web/fonts/jetbrains-mono-latin-*.woff2` | HTML local fallback (jsDelivr `@fontsource` is primary) |
| `../build/web/fonts/NotoSansSC-Regular-subset.woff2` | HTML CJK `@font-face` |

Both families are SIL Open Font License 1.1 (`OFL-JetBrainsMono.txt`, `OFL-NotoSansSC.txt`). Rebuild the CJK subset with:

```bash
python3 tools/subset_cjk_font.py /path/to/NotoSansSC-Regular.otf
```
