#!/usr/bin/env python3
"""Generate a consistent retro-survival pixel set and sync it into the web build."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "pixel"
WEB = ROOT / "godot" / "build" / "web" / "assets" / "pixel"
CELL = 16
HEARTH = 32
SCENE_W, SCENE_H = 160, 96

PAL = {
    "ink": (17, 17, 17, 255),
    "paper": (243, 241, 234, 255),
    "ash": (196, 188, 176, 255),
    "bowl": (48, 34, 26, 255),
    "bowl2": (86, 56, 38, 255),
    "wood": (112, 62, 34, 255),
    "wood2": (164, 102, 52, 255),
    "ember": (148, 36, 18, 255),
    "orange": (228, 116, 36, 255),
    "yellow": (244, 196, 68, 255),
    "hot": (255, 246, 200, 255),
    "smoke": (126, 138, 150, 255),
    "smoke2": (172, 178, 184, 255),
    "leaf": (70, 94, 54, 255),
    "leaf2": (108, 132, 80, 255),
    "sky_night": (28, 32, 48, 255),
    "sky_dawn": (176, 120, 96, 255),
    "sky_day": (186, 198, 186, 255),
    "sky_dusk": (120, 72, 72, 255),
    "dirt": (96, 74, 50, 255),
    "floor": (64, 48, 36, 255),
    "wall": (38, 30, 24, 255),
    "fur": (160, 116, 76, 255),
    "meat": (180, 64, 56, 255),
    "scale": (72, 128, 104, 255),
    "tooth": (236, 228, 208, 255),
    "cloth": (88, 96, 140, 255),
    "gold": (196, 156, 48, 255),
    "red": (172, 36, 36, 255),
    "crack": (28, 14, 10, 255),
    "fox": (196, 92, 40, 255),
    "fox2": (88, 44, 24, 255),
    "clear": (0, 0, 0, 0),
}

FIRE_FRAMES = [
    "bright0", "bright1", "bright2",
    "dim0", "dim1", "dim2", "dim3",
    "ember0", "ember1", "ash", "out", "smoke", "roar",
]


def c(name):
    return PAL[name]


def blank(w, h, fill="clear"):
    return Image.new("RGBA", (w, h), c(fill))


def px(draw, pts, color):
    col = c(color) if isinstance(color, str) else color
    for x, y in pts:
        draw.point((x, y), fill=col)


def dots(draw, color, *pairs):
    px(draw, pairs, color)


def bowl16(draw, y=11):
    dots(draw, "bowl", (4, y), (11, y), (3, y + 1), (12, y + 1), (4, y + 2), (11, y + 2))
    dots(draw, "bowl2", (5, y + 1), (6, y + 1), (9, y + 1), (10, y + 1), (5, y + 2), (10, y + 2))
    dots(draw, "bowl", (7, y + 1), (8, y + 1), (6, y + 2), (7, y + 2), (8, y + 2), (9, y + 2))
    dots(draw, "ink", (6, y + 3), (7, y + 3), (8, y + 3), (9, y + 3))


def flame16(draw, kind):
    bowl16(draw)
    if kind == "out":
        return
    if kind == "ash":
        dots(draw, "ash", (6, 11), (7, 11), (8, 11), (9, 11), (7, 10), (8, 10))
        return
    if kind.startswith("ember"):
        dots(draw, "ember", (6, 10), (9, 10), (7, 11), (8, 11))
        dots(draw, "orange", (7, 10), (8, 10))
        if kind.endswith("1"):
            dots(draw, "yellow", (7, 9))
        return
    if kind == "smoke":
        dots(draw, "smoke", (7, 9), (8, 8), (6, 7), (9, 6), (7, 5), (8, 4))
        dots(draw, "smoke2", (8, 7), (7, 6))
        dots(draw, "ash", (6, 11), (9, 11))
        return
    cores = {
        "bright0": [(7, 3), (8, 3), (6, 4), (7, 4), (8, 4), (9, 4), (6, 5), (7, 5), (8, 5), (9, 5),
                    (7, 6), (8, 6), (6, 7), (7, 7), (8, 7), (9, 7), (7, 8), (8, 8), (6, 9), (7, 9),
                    (8, 9), (9, 9), (7, 10), (8, 10)],
        "bright1": [(8, 2), (7, 3), (8, 3), (6, 4), (7, 4), (8, 4), (7, 5), (8, 5), (9, 5),
                    (6, 6), (7, 6), (8, 6), (7, 7), (8, 7), (9, 7), (6, 8), (7, 8), (8, 8),
                    (7, 9), (8, 9), (7, 10), (8, 10)],
        "bright2": [(7, 2), (6, 3), (7, 3), (8, 3), (6, 4), (7, 4), (8, 4), (9, 4), (6, 5), (7, 5),
                    (8, 5), (7, 6), (8, 6), (9, 6), (6, 7), (7, 7), (8, 7), (7, 8), (8, 8),
                    (6, 9), (7, 9), (8, 9), (7, 10)],
        "dim0": [(7, 5), (8, 5), (6, 6), (7, 6), (8, 6), (7, 7), (8, 7), (6, 8), (7, 8), (8, 8), (7, 9), (8, 9), (7, 10)],
        "dim1": [(8, 6), (7, 7), (8, 7), (6, 8), (7, 8), (8, 8), (7, 9), (8, 9), (7, 10)],
        "dim2": [(7, 7), (8, 7), (7, 8), (8, 8), (6, 9), (7, 9), (8, 9), (7, 10)],
        "dim3": [(7, 8), (8, 8), (7, 9), (8, 9), (7, 10), (8, 10)],
        "roar": [(7, 1), (8, 1), (6, 2), (7, 2), (8, 2), (9, 2), (5, 3), (6, 3), (7, 3), (8, 3), (9, 3),
                 (6, 4), (7, 4), (8, 4), (9, 4), (5, 5), (6, 5), (7, 5), (8, 5), (6, 6), (7, 6),
                 (8, 6), (9, 6), (6, 7), (7, 7), (8, 7), (6, 8), (7, 8), (8, 8), (9, 8), (7, 9), (8, 9), (7, 10)],
    }
    body = cores.get(kind, cores["dim3"])
    px(draw, body, "orange")
    px(draw, [(x, y) for x, y in body if y >= 6], "yellow")
    if kind in ("bright0", "bright1", "bright2", "roar"):
        tip = {"bright0": [(7, 3)], "bright1": [(8, 2)], "bright2": [(7, 2)], "roar": [(7, 1), (8, 1)]}
        px(draw, tip[kind], "hot")
        dots(draw, "ember", (7, 10), (8, 10))


def hearth32(kind):
    img = blank(HEARTH, HEARTH)
    d = ImageDraw.Draw(img)
    # stone ring
    for x, y in [(10, 24), (11, 23), (20, 23), (21, 24), (9, 25), (22, 25), (10, 26), (21, 26)]:
        d.point((x, y), fill=c("ash"))
    d.rectangle((11, 24, 20, 27), fill=c("bowl"))
    d.rectangle((12, 25, 19, 28), fill=c("ink"))
    if kind == "out":
        return img
    if kind == "ash":
        d.rectangle((13, 23, 18, 25), fill=c("ash"))
        return img
    if kind.startswith("ember"):
        d.point((14, 23), fill=c("ember"))
        d.point((17, 23), fill=c("orange"))
        if kind.endswith("1"):
            d.point((15, 22), fill=c("yellow"))
        return img
    if kind == "smoke":
        for x, y in [(16, 20), (15, 17), (17, 15), (14, 13), (18, 11), (16, 9)]:
            d.point((x, y), fill=c("smoke"))
        d.rectangle((13, 23, 18, 25), fill=c("ash"))
        return img
    h = {"bright0": 14, "bright1": 16, "bright2": 13, "dim0": 10, "dim1": 8, "dim2": 6, "dim3": 4, "roar": 18}[kind]
    wobble = {"bright0": 0, "bright1": 1, "bright2": -1, "dim0": 0, "dim1": 1, "dim2": 0, "dim3": 0, "roar": 0}[kind]
    cx = 16 + wobble
    for i in range(h):
        y = 23 - i
        half = max(1, 3 - i // 5)
        col = "hot" if i > h - 3 else ("yellow" if i > h // 3 else "orange")
        d.rectangle((cx - half, y, cx + half, y), fill=c(col))
    if kind == "roar":
        d.point((12, 14), fill=c("orange"))
        d.point((20, 12), fill=c("yellow"))
    d.rectangle((14, 24, 17, 25), fill=c("ember"))
    return img


def sheet_from(frames, painter, name, size=CELL):
    img = blank(size * len(frames), size)
    for i, key in enumerate(frames):
        cell = blank(size, size)
        painter(ImageDraw.Draw(cell), key)
        img.paste(cell, (i * size, 0), cell)
    img.save(SRC / name)
    return img


def woodpile(draw, key):
    n = int(key)
    logs = [
        [(2, 13), (3, 13), (4, 13), (5, 13)],
        [(7, 13), (8, 13), (9, 13), (10, 13)],
        [(4, 11), (5, 11), (6, 11), (7, 11)],
        [(8, 12), (9, 12), (10, 12), (11, 12)],
        [(3, 10), (4, 10), (5, 10)],
        [(8, 10), (9, 10), (10, 10)],
        [(5, 8), (6, 8), (7, 8)],
        [(6, 9), (7, 9), (8, 9)],
    ]
    for i, pts in enumerate(logs[:n]):
        px(draw, pts, "wood" if i % 2 == 0 else "wood2")
        dots(draw, "bowl", (pts[0][0], pts[0][1] + 1))


def icon_house(d):
    dots(d, "ink", (3, 8), (4, 7), (5, 6), (6, 5), (7, 4), (8, 5), (9, 6), (10, 7), (12, 8))
    d.rectangle((4, 8, 11, 13), fill=c("bowl2"))
    d.rectangle((7, 10, 9, 13), fill=c("ink"))
    dots(d, "gold", (5, 10), (6, 10))


def icon_tree(d):
    dots(d, "wood", (7, 12), (8, 12), (7, 13), (8, 13))
    dots(d, "leaf", (5, 8), (6, 7), (7, 6), (8, 6), (9, 7), (10, 8), (4, 9), (5, 9), (6, 9), (7, 9),
         (8, 9), (9, 9), (10, 9), (11, 9), (6, 5), (7, 4), (8, 5), (7, 8), (8, 8))
    dots(d, "leaf2", (7, 5), (8, 7), (6, 8))


def icon_path(d):
    dots(d, "dirt", (3, 12), (4, 11), (5, 10), (6, 9), (7, 8), (8, 7), (9, 6), (10, 5))
    dots(d, "wood2", (4, 12), (5, 11), (6, 10), (7, 9), (8, 8), (9, 7))
    dots(d, "gold", (11, 3), (12, 3), (11, 4), (10, 4), (12, 4))


def icon_axe(d):
    dots(d, "wood", (4, 12), (5, 11), (6, 10), (7, 9), (8, 8), (9, 7))
    dots(d, "ash", (9, 4), (10, 4), (11, 4), (9, 5), (10, 5), (11, 5), (10, 6), (11, 6))
    dots(d, "ink", (8, 5), (9, 6))


def icon_trap(d):
    dots(d, "ink", (3, 12), (4, 11), (5, 10), (6, 9), (7, 8), (12, 12), (11, 11), (10, 10), (9, 9), (8, 8))
    dots(d, "wood", (6, 12), (7, 11), (8, 11), (9, 12))
    dots(d, "ember", (7, 6), (8, 6), (7, 7), (8, 7))


def icon_cart(d):
    d.rectangle((3, 8, 12, 11), fill=c("wood"))
    dots(d, "ink", (4, 12), (5, 13), (6, 12), (9, 12), (10, 13), (11, 12))
    dots(d, "wood2", (5, 7), (6, 6), (7, 6), (8, 7))


def icon_hut(d):
    icon_house(d)
    dots(d, "leaf", (2, 12), (3, 11), (13, 11), (14, 12))


def icon_log(d):
    dots(d, "wood", (3, 8), (4, 7), (5, 7), (6, 7), (7, 7), (8, 7), (9, 7), (10, 8), (11, 9))
    dots(d, "wood2", (3, 9), (4, 8), (5, 8), (6, 8), (7, 8), (8, 8), (9, 8), (10, 9))
    dots(d, "tooth", (3, 8), (11, 9))


def icon_fur(d):
    dots(d, "fur", (4, 6), (5, 5), (6, 5), (7, 6), (8, 5), (9, 5), (10, 6), (4, 7), (5, 7), (6, 7),
         (7, 7), (8, 7), (9, 7), (10, 7), (5, 8), (6, 8), (7, 8), (8, 8), (9, 8), (6, 9), (7, 9), (8, 10))
    dots(d, "ink", (6, 6), (8, 6))


def icon_meat(d):
    dots(d, "meat", (5, 6), (6, 5), (7, 5), (8, 6), (9, 7), (8, 8), (7, 9), (6, 9), (5, 8), (4, 7))
    dots(d, "red", (6, 6), (7, 6), (7, 7))
    dots(d, "tooth", (8, 5), (9, 5))


def icon_scales(d):
    for pts in ([(5, 6), (6, 5), (7, 6), (6, 7)], [(8, 8), (9, 7), (10, 8), (9, 9)], [(6, 10), (7, 9), (8, 10), (7, 11)]):
        px(d, pts, "scale")


def icon_teeth(d):
    dots(d, "tooth", (5, 6), (6, 5), (6, 6), (6, 7), (6, 8), (9, 6), (10, 5), (10, 6), (10, 7), (10, 8))
    dots(d, "ash", (6, 9), (7, 10), (8, 10), (9, 9))


def icon_cloth(d):
    d.rectangle((4, 5, 11, 12), fill=c("cloth"))
    dots(d, "paper", (5, 6), (6, 7), (7, 6), (8, 7), (9, 6), (10, 7))


def icon_bait(d):
    dots(d, "leaf2", (7, 4), (8, 5), (7, 6), (8, 7), (7, 8))
    dots(d, "meat", (6, 9), (7, 9), (8, 9), (9, 10), (8, 11))


def icon_charm(d):
    dots(d, "gold", (7, 4), (8, 4), (6, 5), (9, 5), (5, 6), (10, 6), (6, 7), (9, 7), (7, 8), (8, 8))
    dots(d, "ember", (7, 6), (8, 6))
    dots(d, "wood", (7, 9), (7, 10), (7, 11), (7, 12))


def icon_compass(d):
    dots(d, "ink", (6, 4), (7, 3), (8, 3), (9, 4), (10, 5), (10, 6), (10, 8), (9, 10), (8, 11),
         (7, 11), (6, 10), (5, 8), (5, 6), (5, 5))
    dots(d, "red", (7, 6), (8, 5), (8, 6))
    dots(d, "ash", (7, 8), (8, 8), (7, 9))


def icon_cured(d):
    icon_meat(d)
    dots(d, "wood", (4, 10), (5, 11), (10, 10), (11, 11))


def icon_person(d):
    dots(d, "fur", (7, 4), (8, 4), (7, 5), (8, 5))
    dots(d, "cloth", (6, 6), (7, 6), (8, 6), (9, 6), (7, 7), (8, 7), (7, 8), (8, 8))
    dots(d, "bowl", (6, 9), (6, 10), (9, 9), (9, 10), (7, 11), (8, 11), (7, 12), (8, 12))


def icon_wind(d):
    dots(d, "smoke", (3, 5), (4, 5), (5, 4), (6, 5), (7, 5), (8, 4))
    dots(d, "smoke2", (4, 8), (5, 8), (6, 7), (7, 8), (8, 8), (9, 7), (10, 8))
    dots(d, "ash", (5, 11), (6, 11), (7, 10), (8, 11), (9, 11))


def icon_spark(d):
    dots(d, "yellow", (7, 4), (8, 5), (7, 6), (6, 5), (7, 5))
    dots(d, "orange", (7, 8), (8, 9), (6, 9), (7, 10))


def icon_fast(d):
    for x in (3, 7, 11):
        dots(d, "ink", (x, 5), (x + 1, 6), (x + 2, 7), (x + 1, 8), (x, 9))


def icon_gear(d):
    dots(d, "ink", (7, 3), (8, 3), (3, 7), (3, 8), (12, 7), (12, 8), (7, 12), (8, 12),
         (5, 4), (10, 4), (5, 11), (10, 11), (4, 5), (11, 5), (4, 10), (11, 10),
         (6, 6), (7, 6), (8, 6), (9, 6), (6, 7), (9, 7), (6, 8), (9, 8), (6, 9), (7, 9), (8, 9), (9, 9))


def icon_export(d):
    dots(d, "ink", (4, 12), (5, 12), (6, 12), (7, 12), (8, 12), (9, 12), (10, 12), (11, 12),
         (4, 8), (4, 9), (4, 10), (4, 11), (11, 8), (11, 9), (11, 10), (11, 11),
         (7, 3), (8, 3), (7, 4), (8, 4), (7, 5), (8, 5), (7, 6), (8, 6), (7, 7), (8, 7),
         (5, 6), (6, 5), (7, 4), (8, 4), (9, 5), (10, 6))


def icon_restart(d):
    dots(d, "ink", (10, 4), (11, 4), (11, 5), (10, 5), (9, 4), (9, 3), (8, 3), (6, 4),
         (5, 5), (4, 7), (4, 9), (5, 11), (7, 12), (9, 12), (11, 11), (12, 9))


def icon_classic(d):
    d.rectangle((4, 4, 11, 12), fill=c("ink"))
    d.rectangle((5, 5, 10, 11), fill=c("paper"))
    dots(d, "ink", (6, 7), (7, 7), (8, 7), (6, 9), (7, 9))


def icon_dir(d, dx, dy):
    cx, cy = 7, 7
    pts = [(cx + dx * i, cy + dy * i) for i in range(5)]
    if dx:
        pts += [(cx + dx * 3, cy - 1), (cx + dx * 3, cy + 1), (cx + dx * 2, cy - 2), (cx + dx * 2, cy + 2)]
    else:
        pts += [(cx - 1, cy + dy * 3), (cx + 1, cy + dy * 3), (cx - 2, cy + dy * 2), (cx + 2, cy + dy * 2)]
    px(d, pts, "ink")


def icon_embark(d):
    icon_compass(d)
    dots(d, "dirt", (3, 12), (4, 11), (5, 12))


def icon_punch(d):
    dots(d, "fur", (5, 7), (6, 6), (7, 6), (8, 7), (9, 8), (8, 9), (7, 10), (6, 9), (5, 8))
    dots(d, "ink", (9, 6), (10, 5), (11, 5), (12, 6))


def icon_flee(d):
    dots(d, "ink", (4, 7), (5, 6), (6, 7), (5, 8), (8, 7), (9, 6), (10, 7), (11, 6), (12, 7))


def icon_ok(d):
    dots(d, "leaf", (4, 8), (5, 9), (6, 10), (7, 9), (8, 8), (9, 7), (10, 6), (11, 5))


def icon_no(d):
    dots(d, "red", (4, 4), (5, 5), (6, 6), (7, 7), (8, 8), (9, 9), (10, 10), (11, 11),
         (11, 4), (10, 5), (9, 6), (8, 7), (7, 8), (6, 9), (5, 10), (4, 11))


def icon_pop(d):
    icon_person(d)
    dots(d, "fur", (3, 6), (4, 5), (4, 6), (11, 6), (12, 5), (12, 6))


def icon_water(d):
    dots(d, "cloth", (7, 4), (6, 5), (8, 5), (5, 7), (9, 7), (5, 9), (6, 10), (7, 11), (8, 10), (9, 9))
    dots(d, "paper", (7, 7), (7, 8))


def icon_heart(d):
    dots(d, "red", (5, 6), (6, 5), (7, 6), (8, 5), (9, 6), (9, 7), (8, 8), (7, 9), (6, 8), (5, 7))


def icon_match(d):
    dots(d, "orange", (8, 5), (7, 6), (8, 6))
    dots(d, "wood", (7, 7), (7, 8), (7, 9), (7, 10), (7, 11))


def icon_plus(d):
    dots(d, "ink", (7, 4), (7, 5), (7, 6), (7, 7), (7, 8), (7, 9), (7, 10), (4, 7), (5, 7), (6, 7), (8, 7), (9, 7), (10, 7))


def icon_minus(d):
    dots(d, "ink", (4, 7), (5, 7), (6, 7), (7, 7), (8, 7), (9, 7), (10, 7))


def icon_director(d):
    dots(d, "ink", (4, 5), (5, 4), (6, 4), (7, 5), (8, 5), (9, 4), (10, 4), (11, 5),
         (4, 6), (11, 6), (5, 8), (6, 9), (9, 9), (10, 8), (6, 11), (7, 12), (8, 12), (9, 11))


def icon_cold(d):
    dots(d, "smoke2", (7, 3), (7, 4), (7, 5), (7, 6), (6, 4), (8, 4), (5, 7), (9, 7))
    dots(d, "ash", (4, 10), (5, 9), (6, 10), (7, 11), (8, 10), (9, 9), (10, 10))


def icon_hot(d):
    dots(d, "orange", (4, 11), (5, 10), (6, 9), (7, 8), (8, 9), (9, 10), (10, 11))
    dots(d, "yellow", (7, 4), (6, 5), (8, 5), (7, 6))


def icon_beast(d):
    dots(d, "ink", (4, 7), (5, 6), (6, 6), (7, 7), (8, 6), (9, 6), (10, 7), (5, 8), (9, 8))
    dots(d, "red", (5, 7), (9, 7))
    dots(d, "bowl", (6, 9), (7, 10), (8, 9))


def icon_sound(d):
    dots(d, "ink", (4, 7), (5, 6), (6, 5), (6, 9), (5, 8), (5, 7), (8, 5), (9, 4), (10, 5), (10, 9), (9, 10), (8, 9))
    dots(d, "ash", (11, 3), (12, 4), (12, 10), (11, 11))


def icon_trade(d):
    icon_fur(d)
    dots(d, "gold", (11, 4), (12, 5), (11, 6), (12, 7))


def icon_stores(d):
    d.rectangle((3, 5, 12, 12), fill=c("wood"))
    d.rectangle((4, 6, 11, 11), fill=c("paper"))
    dots(d, "wood2", (6, 8), (7, 8), (8, 8))


def icon_light(d):
    flame16(d, "out")
    dots(d, "orange", (8, 6), (7, 7))
    dots(d, "wood", (7, 8), (7, 9))


def icon_stoke(d):
    flame16(d, "bright1")


def icon_phase_room(d):
    icon_house(d)


def icon_phase_forest(d):
    icon_tree(d)


ICONS = [
    ("room", icon_house),
    ("forest", icon_tree),
    ("path", icon_path),
    ("gather", icon_axe),
    ("trap", icon_trap),
    ("cart", icon_cart),
    ("hut", icon_hut),
    ("wood", icon_log),
    ("fur", icon_fur),
    ("meat", icon_meat),
    ("scales", icon_scales),
    ("teeth", icon_teeth),
    ("cloth", icon_cloth),
    ("bait", icon_bait),
    ("charm", icon_charm),
    ("compass", icon_compass),
    ("cured_meat", icon_cured),
    ("person", icon_person),
    ("wind", icon_wind),
    ("spark", icon_spark),
    ("fast", icon_fast),
    ("settings", icon_gear),
    ("export", icon_export),
    ("restart", icon_restart),
    ("classic", icon_classic),
    ("north", lambda d: icon_dir(d, 0, -1)),
    ("west", lambda d: icon_dir(d, -1, 0)),
    ("east", lambda d: icon_dir(d, 1, 0)),
    ("south", lambda d: icon_dir(d, 0, 1)),
    ("embark", icon_embark),
    ("punch", icon_punch),
    ("flee", icon_flee),
    ("ok", icon_ok),
    ("no", icon_no),
    ("pop", icon_pop),
    ("water", icon_water),
    ("heart", icon_heart),
    ("match", icon_match),
    ("plus", icon_plus),
    ("minus", icon_minus),
    ("director", icon_director),
    ("cold", icon_cold),
    ("hot", icon_hot),
    ("beast", icon_beast),
    ("sound", icon_sound),
    ("trade", icon_trade),
    ("stores", icon_stores),
    ("fire", icon_stoke),
    ("light", icon_light),
    ("stoke", icon_stoke),
    ("phase_room", icon_phase_room),
    ("phase_forest", icon_phase_forest),
]


def write_icons():
    cols = 8
    rows = (len(ICONS) + cols - 1) // cols
    img = blank(CELL * cols, CELL * rows)
    names = []
    for i, (name, fn) in enumerate(ICONS):
        cell = blank(CELL, CELL)
        fn(ImageDraw.Draw(cell))
        img.paste(cell, ((i % cols) * CELL, (i // cols) * CELL), cell)
        names.append(name)
    img.save(SRC / "icons.png")
    (SRC / "icons.json").write_text(json.dumps({"cell": CELL, "cols": cols, "names": names}, indent=2) + "\n")
    scale = 4
    rules = [
        ".px-icon{display:inline-block;width:%dpx;height:%dpx;background:url(\"icons.png\") no-repeat;background-size:%dpx %dpx;image-rendering:pixelated;image-rendering:crisp-edges}"
        % (CELL * scale, CELL * scale, CELL * cols * scale, CELL * rows * scale)
    ]
    for i, name in enumerate(names):
        x = -(i % cols) * CELL * scale
        y = -(i // cols) * CELL * scale
        rules.append(".px-%s{background-position:%dpx %dpx}" % (name, x, y))
    (SRC / "pixel-icons.css").write_text("\n".join(rules) + "\n")
    return img, names


def scene_room():
    img = blank(SCENE_W, SCENE_H, "wall")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 64, SCENE_W, SCENE_H), fill=c("floor"))
    for x in range(0, SCENE_W, 8):
        d.line((x, 64, x + 4, 64), fill=c("bowl"))
    d.rectangle((18, 16, 50, 50), fill=c("ink"))
    d.rectangle((20, 18, 48, 48), fill=c("sky_night"))
    d.rectangle((108, 28, 142, 64), fill=c("bowl"))
    d.rectangle((112, 32, 138, 64), fill=c("bowl2"))
    d.point((132, 48), fill=c("gold"))
    # hearth stones
    d.ellipse((64, 68, 96, 86), fill=c("bowl"))
    d.ellipse((68, 70, 92, 84), fill=c("ink"))
    img.save(SRC / "room-bg.png")
    return img


def scene_forest():
    img = blank(SCENE_W, SCENE_H, "sky_day")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 58, SCENE_W, SCENE_H), fill=c("dirt"))
    for x, y, s in ((10, 26, 20), (34, 20, 24), (68, 24, 22), (102, 18, 28), (132, 28, 18)):
        d.ellipse((x, y, x + s, y + s + 6), fill=c("leaf"))
        d.rectangle((x + s // 2 - 2, y + s, x + s // 2 + 2, 64), fill=c("wood"))
    d.rectangle((0, 70, SCENE_W, 78), fill=c("leaf2"))
    img.save(SRC / "forest-bg.png")
    return img


def scene_path():
    img = blank(SCENE_W, SCENE_H, "ash")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, SCENE_W, 40), fill=c("sky_dusk"))
    d.polygon([(36, 96), (70, 22), (92, 22), (132, 96)], fill=c("dirt"))
    d.ellipse((118, 14, 140, 28), fill=c("gold"))
    img.save(SRC / "path-bg.png")
    return img


def paper_tile():
    img = blank(CELL, CELL, "paper")
    d = ImageDraw.Draw(img)
    for x, y in ((2, 3), (9, 5), (5, 11), (13, 12), (11, 2), (1, 14)):
        d.point((x, y), fill=(220, 216, 206, 255))
    img.save(SRC / "paper-tile.png")
    return img


def dirt_tile():
    img = blank(CELL, CELL, "floor")
    d = ImageDraw.Draw(img)
    for x, y in ((3, 4), (10, 7), (6, 12), (13, 2)):
        d.point((x, y), fill=c("bowl"))
    img.save(SRC / "dirt-tile.png")
    return img


def overheat_and_smoke():
    img = blank(CELL, CELL)
    d = ImageDraw.Draw(img)
    dots(d, "crack", (3, 4), (4, 5), (5, 7), (6, 8), (4, 10), (10, 3), (11, 5), (12, 8), (9, 11))
    dots(d, "ember", (6, 4), (9, 6), (7, 12))
    img.save(SRC / "overheat.png")
    smoke = blank(CELL * 3, CELL)
    frames = (
        [(6, 10), (7, 8), (8, 6), (6, 5)],
        [(8, 11), (9, 8), (7, 6), (8, 4)],
        [(5, 9), (6, 7), (9, 5), (10, 3)],
    )
    for i, pts in enumerate(frames):
        cell = blank(CELL, CELL)
        dd = ImageDraw.Draw(cell)
        px(dd, pts, "smoke")
        px(dd, [(p[0] + 1, max(0, p[1] - 1)) for p in pts[:2]], "smoke2")
        smoke.paste(cell, (i * CELL, 0), cell)
    smoke.save(SRC / "smoke-sheet.png")
    return img, smoke


def sky_sheet():
    img = blank(SCENE_W * 4, 32)
    colors = ["sky_night", "sky_dawn", "sky_day", "sky_dusk"]
    extras = [
        [(20, 8), (40, 6), (90, 10)],
        [(140, 8)],
        [],
        [(24, 10), (70, 6)],
    ]
    suns = [None, (28, 10, "orange"), (120, 8, "hot"), (30, 12, "ember")]
    for i, col in enumerate(colors):
        d = ImageDraw.Draw(img)
        d.rectangle((i * SCENE_W, 0, (i + 1) * SCENE_W - 1, 31), fill=c(col))
        for x, y in extras[i]:
            d.point((i * SCENE_W + x, y), fill=c("paper"))
        if suns[i]:
            x, y, sc = suns[i]
            d.ellipse((i * SCENE_W + x, y, i * SCENE_W + x + 6, y + 6), fill=c(sc))
    img.save(SRC / "sky-sheet.png")
    return img


def animal_sheet():
    """Four-frame fox trot, 16x16."""
    img = blank(CELL * 4, CELL)
    poses = [
        [(2, 10), (3, 9), (4, 9), (5, 9), (6, 10), (7, 9), (8, 9), (3, 8), (8, 8), (9, 8), (1, 11), (4, 12), (6, 12), (8, 11)],
        [(2, 10), (3, 9), (4, 9), (5, 9), (6, 10), (7, 9), (8, 9), (3, 8), (8, 8), (9, 8), (2, 12), (5, 11), (7, 12), (9, 10)],
        [(2, 10), (3, 9), (4, 9), (5, 9), (6, 10), (7, 9), (8, 9), (3, 8), (8, 8), (9, 8), (1, 11), (4, 12), (6, 12), (8, 11)],
        [(2, 10), (3, 9), (4, 9), (5, 9), (6, 10), (7, 9), (8, 9), (3, 8), (8, 8), (9, 8), (3, 12), (5, 12), (6, 11), (9, 12)],
    ]
    for i, body in enumerate(poses):
        cell = blank(CELL, CELL)
        d = ImageDraw.Draw(cell)
        px(d, body, "fox")
        dots(d, "fox2", (3, 8), (8, 8), (9, 8))
        dots(d, "ink", (9, 7))
        dots(d, "fox2", (1, 9) if i % 2 == 0 else (1, 10))
        img.paste(cell, (i * CELL, 0), cell)
    img.save(SRC / "animal-sheet.png")
    return img


def phase_wipe():
    """Door/forest wipe frames for scene changes."""
    img = blank(CELL * 4, CELL)
    for i in range(4):
        cell = blank(CELL, CELL, "ink")
        d = ImageDraw.Draw(cell)
        gap = 1 + i
        d.rectangle((gap, 2, 15 - gap, 13), fill=c("paper"))
        if i >= 2:
            icon_tree(d) if i == 3 else icon_house(d)
        img.paste(cell, (i * CELL, 0), cell)
    img.save(SRC / "phase-wipe.png")
    return img


def write_hearth():
    img = blank(HEARTH * len(FIRE_FRAMES), HEARTH)
    for i, key in enumerate(FIRE_FRAMES):
        img.paste(hearth32(key), (i * HEARTH, 0))
    img.save(SRC / "hearth-sheet.png")
    return img


def font():
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, 14)
    return ImageFont.load_default()


def preview_sheet(parts):
    """Labeled contact sheet for humans — not used inside the game."""
    fnt = font()
    rows = []
    pad = 16
    label_h = 22
    max_w = 0
    for title, im in parts:
        w = max(im.width * 4 if im.width <= 256 else im.width, 320)
        h = (im.height * 4 if im.width <= 256 else im.height) + label_h + pad
        rows.append((title, im, w, h))
        max_w = max(max_w, w + pad * 2)
    total_h = pad + sum(h for *_, h in rows)
    sheet = Image.new("RGB", (max_w, total_h), (243, 241, 234))
    d = ImageDraw.Draw(sheet)
    y = pad
    for title, im, w, h in rows:
        d.text((pad, y), title, fill=(17, 17, 17), font=fnt)
        scale = 4 if im.width <= 256 else 1
        shown = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        bg = Image.new("RGBA", shown.size, (255, 255, 255, 255))
        bg.alpha_composite(shown)
        sheet.paste(bg.convert("RGB"), (pad, y + label_h))
        y += h
    dest = SRC / "pixel-assets-preview.png"
    sheet.save(dest)
    return dest


def sync_web():
    WEB.mkdir(parents=True, exist_ok=True)
    for src in SRC.iterdir():
        if src.is_file():
            shutil.copy2(src, WEB / src.name)


def main():
    SRC.mkdir(parents=True, exist_ok=True)
    fire = sheet_from(FIRE_FRAMES, flame16, "fire-sheet.png")
    wood = sheet_from(["0", "2", "4", "6", "8"], woodpile, "woodpile-sheet.png")
    icons, names = write_icons()
    room = scene_room()
    forest = scene_forest()
    path = scene_path()
    paper = paper_tile()
    dirt = dirt_tile()
    cracks, smoke = overheat_and_smoke()
    sky = sky_sheet()
    animal = animal_sheet()
    wipe = phase_wipe()
    hearth = write_hearth()
    (SRC / "manifest.json").write_text(json.dumps({
        "palette": {k: list(v) for k, v in PAL.items() if k != "clear"},
        "fire_frames": FIRE_FRAMES,
        "icons": names,
        "cell": CELL,
        "hearth": HEARTH,
        "scene": [SCENE_W, SCENE_H],
    }, indent=2) + "\n")
    preview = preview_sheet([
        ("1 fire-sheet: stoke cooldown bright to dark + room fire states", fire),
        ("2 hearth-sheet: larger room fire lit / dim / ember / out / roar", hearth),
        ("3 woodpile-sheet: stacked logs for wood quantity", wood),
        ("4 icons: buttons, resources, phase tabs, menu (no in-game text)", icons),
        ("5 room / forest / path scene backdrops", _hstack([room, forest, path])),
        ("6 sky-sheet: night / dawn / day / dusk ambient", sky),
        ("7 animal-sheet: fox pass-by walk cycle", animal),
        ("8 smoke-sheet + overheat cracks", _hstack([smoke, cracks])),
        ("9 paper-tile + dirt-tile backgrounds", _hstack([paper, dirt])),
        ("10 phase-wipe: text-free scene change cue", wipe),
    ])
    sync_web()
    print("source", SRC)
    print("web", WEB)
    print("preview", preview)
    print("files", sorted(p.name for p in SRC.iterdir()))


def _hstack(images):
    w = sum(im.width + 8 for im in images) - 8
    h = max(im.height for im in images)
    out = blank(w, h, "paper")
    x = 0
    for im in images:
        out.paste(im, (x, 0), im if im.mode == "RGBA" else None)
        x += im.width + 8
    return out


if __name__ == "__main__":
    main()
