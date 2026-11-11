import json
import os
import re
import urllib.parse
import urllib.request
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

WORKSPACE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ARTIFACT_DIR = "/home/daniel/.gemini/antigravity/brain/4c4feb9a-de6c-4d83-9b94-d9c5ecff9fdd"
CACHE_DIR = os.path.join(WORKSPACE, "config", ".cache", "obs_assets")
os.makedirs(CACHE_DIR, exist_ok=True)


def fetch_bytes(url):
    if "minecraft.wiki/w/Special:FilePath/" in url:
        fname = urllib.parse.unquote(url.split("Special:FilePath/")[-1])
        api_url = f"https://minecraft.wiki/api.php?action=query&titles=File:{urllib.parse.quote(fname)}&prop=imageinfo&iiprop=url&format=json"
        req_api = urllib.request.Request(api_url, headers={"User-Agent": "MinecraftTikTokRcon/2.1"})
        with urllib.request.urlopen(req_api, timeout=15) as r:
            data = json.loads(r.read().decode())
            pages = data.get("query", {}).get("pages", {})
            for p in pages.values():
                direct = (p.get("imageinfo") or [{}])[0].get("url")
                if direct:
                    url = direct
                    break

    req = urllib.request.Request(url, headers={"User-Agent": "MinecraftTikTokRcon/2.1"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def get_font(name, url, size, fallback_path):
    ttf_path = os.path.join(CACHE_DIR, name)
    if not os.path.exists(ttf_path) and url:
        try:
            data = fetch_bytes(url)
            with open(ttf_path, "wb") as f:
                f.write(data)
        except Exception:
            pass
    if os.path.exists(ttf_path):
        try:
            return ImageFont.truetype(ttf_path, size)
        except Exception:
            pass
    return ImageFont.truetype(fallback_path, size)


def load_image_from_url(url, size):
    if not url:
        return None
    cache_key = re.sub(r"[^a-zA-Z0-9_.-]", "_", url.split("/")[-1])[:80]
    cache_path = os.path.join(CACHE_DIR, f"img_{cache_key}.png")
    if os.path.exists(cache_path):
        try:
            img = Image.open(cache_path).convert("RGBA")
            img.thumbnail(size, Image.Resampling.LANCZOS)
            return img
        except Exception:
            pass
    try:
        raw = fetch_bytes(url)
        img = Image.open(BytesIO(raw)).convert("RGBA")
        img.save(cache_path, "PNG")
        img.thumbnail(size, Image.Resampling.LANCZOS)
        return img
    except Exception:
        return None


def parse_rule_commands(commands, mobs_by_id, items_by_id):
    mob_counts = {}
    item_counts = {}
    for cmd in commands:
        c = cmd.strip()
        m_sum = re.match(r"^(?:execute\s+at\s+\S+\s+run\s+)?summon\s+([^\s;]+)", c, re.I)
        if m_sum:
            role_id = m_sum.group(1).lower()
            if ":" not in role_id:
                role_id = f"minecraft:{role_id}"
            mob_counts[role_id] = mob_counts.get(role_id, 0) + 1
            continue
        m_give = re.match(
            r"^(?:execute\s+at\s+\S+\s+run\s+)?give\s+\S+\s+([^\s;]+)(?:\s+(\d+))?",
            c,
            re.I,
        )
        if m_give:
            item_id = m_give.group(1).lower()
            if ":" not in item_id:
                item_id = f"minecraft:{item_id}"
            qty = int(m_give.group(2) or 1)
            item_counts[item_id] = item_counts.get(item_id, 0) + qty

    spawns = []
    for role_id, count in mob_counts.items():
        info = mobs_by_id.get(role_id, {})
        name = info.get("name") or role_id.replace("minecraft:", "").replace("_", " ").title()
        spawns.append(
            {
                "kind": "mob",
                "id": role_id,
                "name": name,
                "count": count,
                "image": info.get("image", f"https://minecraft.wiki/w/Special:FilePath/{name.replace(' ', '_')}.png"),
            }
        )
    for item_id, count in item_counts.items():
        info = items_by_id.get(item_id, {})
        name = info.get("name") or item_id.replace("minecraft:", "").replace("_", " ").title()
        spawns.append(
            {
                "kind": "item",
                "id": item_id,
                "name": name,
                "count": count,
                "image": info.get("image") or info.get("fallbackImage"),
            }
        )
    return spawns


def draw_pixel_arrow(draw, cx, cy, color):
    draw.rectangle([cx - 24, cy - 5, cx + 6, cy + 5], fill=color)
    draw.rectangle([cx + 6, cy - 14, cx + 14, cy + 14], fill=color)
    draw.rectangle([cx + 14, cy - 8, cx + 21, cy + 8], fill=color)
    draw.rectangle([cx + 21, cy - 4, cx + 26, cy + 4], fill=color)


def draw_pixel_follow_icon(draw, box):
    x1, y1, x2, y2 = box
    cx = (x1 + x2) // 2 - 10
    cy = (y1 + y2) // 2 - 6
    head_col = (56, 189, 248, 255)
    body_col = (14, 165, 233, 255)
    plus_col = (108, 195, 73, 255)
    draw.rectangle([cx - 16, cy - 28, cx + 16, cy + 4], fill=head_col, outline=(255, 255, 255, 255), width=2)
    draw.rectangle([cx - 26, cy + 8, cx + 26, cy + 34], fill=body_col, outline=(255, 255, 255, 255), width=2)
    px, py = cx + 32, cy - 8
    draw.rectangle([px - 4, py - 14, px + 4, py + 14], fill=plus_col)
    draw.rectangle([px - 14, py - 4, px + 14, py + 4], fill=plus_col)


def draw_pixel_heart_icon(draw, box):
    x1, y1, x2, y2 = box
    grid = [
        "  XX   XX  ",
        " XXXX XXXX ",
        "XXXXXXXXXXX",
        "XXXXXXXXXXX",
        "XXXXXXXXXXX",
        " XXXXXXXXX ",
        "  XXXXXXX  ",
        "   XXXXX   ",
        "    XXX    ",
        "     X     ",
    ]
    scale = 7
    gw = 11 * scale
    gh = 10 * scale
    sx = x1 + (x2 - x1 - gw) // 2
    sy = y1 + (y2 - y1 - gh) // 2 - 12
    red_main = (239, 68, 68, 255)
    red_hi = (252, 165, 165, 255)
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if ch == "X":
                col = red_hi if (r in (1, 2) and c in (2, 3)) else red_main
                px1 = sx + c * scale
                py1 = sy + r * scale
                draw.rectangle([px1, py1, px1 + scale - 1, py1 + scale - 1], fill=col)


def render_spawns_right_side(
    img,
    draw,
    spawns,
    x2,
    gy_box1,
    gy_box2,
    slot_size,
    accent_color,
    BADGE_BG,
    MC_GOLD,
    font_qty,
    font_qty_sm,
    draw_centered_text,
):
    BG_ABYSS = (17, 17, 16, 255)
    if len(spawns) >= 2:
        sub_w = 102
        rx2 = x2 - 16
        rx1 = rx2 - (sub_w * 2 + 8)
        for s_idx, sp in enumerate(spawns[:2]):
            sx1 = rx1 + s_idx * (sub_w + 8)
            sy1 = gy_box1
            sx2 = sx1 + sub_w
            sy2 = gy_box2
            draw.rectangle([sx1, sy1, sx2, sy2], fill=BG_ABYSS, outline=accent_color, width=3)

            m_img = load_image_from_url(sp.get("image"), (82, 92))
            if m_img:
                img.paste(
                    m_img,
                    (sx1 + (sub_w - m_img.width) // 2, sy1 + 8 + (96 - m_img.height) // 2),
                    m_img,
                )

            q_box = [sx1 + 6, sy2 - 38, sx2 - 6, sy2 - 6]
            draw.rectangle(q_box, fill=BADGE_BG, outline=MC_GOLD, width=2)
            draw_centered_text(q_box, f"x{sp['count']}", MC_GOLD, font_qty_sm)
    else:
        mx_box2 = x2 - 20
        mx_box1 = mx_box2 - slot_size
        my_box1 = gy_box1
        my_box2 = gy_box2
        draw.rectangle([mx_box1, my_box1, mx_box2, my_box2], fill=BG_ABYSS, outline=accent_color, width=3)

        primary_spawn = spawns[0] if spawns else {"count": 1, "image": ""}
        mob_img = load_image_from_url(primary_spawn.get("image"), (120, 120))
        if mob_img:
            img.paste(
                mob_img,
                (mx_box1 + (slot_size - mob_img.width) // 2, my_box1 + (slot_size - mob_img.height) // 2),
                mob_img,
            )

        qty = primary_spawn.get("count", 1)
        q_box = [mx_box1 - 18, my_box2 - 48, mx_box1 + 64, my_box2 - 6]
        draw.rectangle(q_box, fill=BADGE_BG, outline=MC_GOLD, width=3)
        draw_centered_text(q_box, f"x{qty}", MC_GOLD, font_qty)


def build_layout(transparent_game_box=True):
    W, H = 1080, 1920
    BG_ABYSS = (17, 17, 16, 255)
    BG_MAIN = (24, 23, 22, 255)
    BG_PANEL = (33, 32, 30, 255)
    BORDER_STEEL = (79, 76, 71, 255)
    MC_GREEN_BRIGHT = (82, 165, 53, 255)
    MC_GREEN_TEXT = (108, 195, 73, 255)
    MC_GOLD = (255, 170, 0, 255)
    MC_RED = (185, 43, 39, 255)
    MC_CYAN = (56, 189, 248, 255)
    BADGE_BG = (20, 20, 18, 255)

    img = Image.new("RGBA", (W, H), BG_MAIN)
    draw = ImageDraw.Draw(img)

    silkscreen_bold_url = "https://github.com/google/fonts/raw/main/ofl/silkscreen/Silkscreen-Bold.ttf"
    fallback_sans = "/usr/share/fonts/google-noto/NotoSans-ExtraBold.ttf"
    if not os.path.exists(fallback_sans):
        fallback_sans = "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Bold.ttf"

    font_qty = get_font("Silkscreen-Bold.ttf", silkscreen_bold_url, 28, fallback_sans)
    font_qty_sm = get_font("Silkscreen-Bold.ttf", silkscreen_bold_url, 20, fallback_sans)
    font_tag = get_font("Silkscreen-Bold.ttf", silkscreen_bold_url, 16, fallback_sans)

    def draw_centered_text(box, text, fill, font):
        bx1, by1, bx2, by2 = box
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = bx1 + (bx2 - bx1 - tw) // 2
        ty = by1 + (by2 - by1 - th) // 2 - bbox[1]
        draw.text((tx, ty), text, fill=fill, font=font)

    with open(os.path.join(WORKSPACE, "config/gifts.json"), "r", encoding="utf-8") as f:
        config = json.load(f)

    gifts_cache_path = os.path.join(WORKSPACE, "config/.cache/tiktok-gifts.json")
    mobs_cache_path = os.path.join(WORKSPACE, "config/.cache/mobs.json")
    items_cache_path = os.path.join(WORKSPACE, "config/.cache/items.json")

    gifts_by_name = {}
    if os.path.exists(gifts_cache_path):
        for g in json.load(open(gifts_cache_path, "r", encoding="utf-8")):
            gifts_by_name[g["name"].lower()] = g

    mobs_by_id = {}
    if os.path.exists(mobs_cache_path):
        for m in json.load(open(mobs_cache_path, "r", encoding="utf-8")):
            mobs_by_id[m["roleId"].lower()] = m

    items_by_id = {}
    if os.path.exists(items_cache_path):
        for it in json.load(open(items_cache_path, "r", encoding="utf-8")):
            items_by_id[it["itemId"].lower()] = it

    col_w = 502
    gap_x = 20
    start_x = 28

    # =========================================================
    # 1. TOP SECTION: NUEVO FOLLOW & META DE LIKES (Y=24 to 204)
    # =========================================================
    top_y1 = 24
    top_h = 180
    top_y2 = top_y1 + top_h
    top_slot = 144

    follow_cfg = (config.get("specialEvents") or {}).get("follow") or {}
    like_cfg = (config.get("specialEvents") or {}).get("likeMilestone") or {}
    every_likes = like_cfg.get("everyLikes", 100)

    top_cards = [
        {
            "type": "follow",
            "label": "FOLLOW",
            "accent": MC_CYAN,
            "spawns": parse_rule_commands(follow_cfg.get("commands", []), mobs_by_id, items_by_id),
        },
        {
            "type": "likes",
            "label": f"x{every_likes}",
            "accent": (239, 68, 68, 255),
            "spawns": parse_rule_commands(like_cfg.get("commands", []), mobs_by_id, items_by_id),
        },
    ]

    for idx, tcard in enumerate(top_cards):
        x1 = start_x + idx * (col_w + gap_x)
        x2 = x1 + col_w
        accent_color = tcard["accent"]

        draw.rectangle([x1, top_y1, x2, top_y2], fill=BG_PANEL, outline=accent_color, width=3)
        draw.rectangle([x1, top_y1, x2, top_y1 + 6], fill=accent_color)

        gx_box1 = x1 + 20
        gy_box1 = top_y1 + (top_h - top_slot) // 2 + 2
        gx_box2 = gx_box1 + top_slot
        gy_box2 = gy_box1 + top_slot
        draw.rectangle([gx_box1, gy_box1, gx_box2, gy_box2], fill=BG_ABYSS, outline=BORDER_STEEL, width=3)

        if tcard["type"] == "follow":
            draw_pixel_follow_icon(draw, [gx_box1, gy_box1, gx_box2, gy_box2 - 22])
            tag_box = [gx_box1 + 8, gy_box2 - 36, gx_box2 - 8, gy_box2 - 6]
            draw.rectangle(tag_box, fill=BADGE_BG, outline=MC_CYAN, width=2)
            draw_centered_text(tag_box, "FOLLOW", MC_CYAN, font_tag)
        else:
            draw_pixel_heart_icon(draw, [gx_box1, gy_box1, gx_box2, gy_box2])
            tag_box = [gx_box1 + 8, gy_box2 - 36, gx_box2 - 8, gy_box2 - 6]
            draw.rectangle(tag_box, fill=BADGE_BG, outline=(239, 68, 68, 255), width=2)
            draw_centered_text(tag_box, tcard["label"], MC_GOLD, font_qty_sm)

        arrow_cx = x1 + col_w // 2 - 14
        arrow_cy = top_y1 + top_h // 2 + 2
        draw_pixel_arrow(draw, arrow_cx, arrow_cy, MC_GREEN_TEXT)

        render_spawns_right_side(
            img,
            draw,
            tcard["spawns"],
            x2,
            gy_box1,
            gy_box2,
            top_slot,
            accent_color,
            BADGE_BG,
            MC_GOLD,
            font_qty,
            font_qty_sm,
            draw_centered_text,
        )

    # =========================================================
    # 2. CENTER SECTION: GAME SCREEN AREA (Y=224 to 1260 -> 1024 x 1036 px)
    # =========================================================
    gx1, gy1, gx2, gy2 = 28, 224, 1052, 1260
    draw.rectangle([gx1, gy1, gx2, gy2], fill=BG_ABYSS, outline=MC_GREEN_BRIGHT, width=4)
    cx1, cy1, cx2, cy2 = gx1 + 8, gy1 + 8, gx2 - 8, gy2 - 8

    if transparent_game_box:
        draw.rectangle([cx1, cy1, cx2, cy2], fill=(0, 0, 0, 0))
    else:
        draw.rectangle([cx1, cy1, cx2, cy2], fill=(16, 16, 15, 255))
        for x in range(cx1 + 80, cx2, 80):
            draw.line([(x, cy1), (x, cy2)], fill=(26, 26, 24, 255), width=1)
        for y in range(cy1 + 80, cy2, 80):
            draw.line([(cx1, y), (cx2, y)], fill=(26, 26, 24, 255), width=1)

    b_len = 28
    for bx, by, dx, dy in [
        (gx1, gy1, 1, 1),
        (gx2, gy1, -1, 1),
        (gx1, gy2, 1, -1),
        (gx2, gy2, -1, -1),
    ]:
        draw.rectangle(
            [min(bx, bx + dx * b_len), min(by, by + dy * 6), max(bx, bx + dx * b_len), max(by, by + dy * 6)],
            fill=MC_GOLD,
        )
        draw.rectangle(
            [min(bx, bx + dx * 6), min(by, by + dy * b_len), max(bx, bx + dx * 6), max(by, by + dy * b_len)],
            fill=MC_GOLD,
        )

    # =========================================================
    # 3. BOTTOM SECTION: 6 GIFTS IN A 2x3 GRID (Y=1280 to 1896)
    # =========================================================
    gifts_cfg = list((config.get("gifts") or {}).items())[:6]
    row_h = 194
    gap_y = 16
    start_y = 1280
    slot_size = 150

    for idx, (gift_name, rule) in enumerate(gifts_cfg):
        col = idx % 2
        row = idx // 2
        x1 = start_x + col * (col_w + gap_x)
        y1 = start_y + row * (row_h + gap_y)
        x2 = x1 + col_w
        y2 = y1 + row_h

        g_info = gifts_by_name.get(gift_name.lower(), {"name": gift_name, "coins": 1, "image": ""})
        g_img_url = g_info.get("image", "")
        spawns = parse_rule_commands(rule.get("commands", []), mobs_by_id, items_by_id)

        is_boss = any("warden" in s["id"] or "dragon" in s["id"] or "wither" in s["id"] for s in spawns)
        card_border = MC_RED if is_boss else BORDER_STEEL
        accent_color = MC_RED if is_boss else MC_GREEN_BRIGHT

        draw.rectangle([x1, y1, x2, y2], fill=BG_PANEL, outline=card_border, width=3)
        draw.rectangle([x1, y1, x2, y1 + 6], fill=accent_color)

        gx_box1 = x1 + 20
        gy_box1 = y1 + (row_h - slot_size) // 2 + 2
        gx_box2 = gx_box1 + slot_size
        gy_box2 = gy_box1 + slot_size
        draw.rectangle([gx_box1, gy_box1, gx_box2, gy_box2], fill=BG_ABYSS, outline=BORDER_STEEL, width=3)

        gift_img = load_image_from_url(g_img_url, (122, 122))
        if gift_img:
            img.paste(
                gift_img,
                (gx_box1 + (slot_size - gift_img.width) // 2, gy_box1 + (slot_size - gift_img.height) // 2),
                gift_img,
            )

        arrow_cx = x1 + col_w // 2 - 14
        arrow_cy = y1 + row_h // 2 + 2
        draw_pixel_arrow(draw, arrow_cx, arrow_cy, MC_GREEN_TEXT if not is_boss else MC_GOLD)

        render_spawns_right_side(
            img,
            draw,
            spawns,
            x2,
            gy_box1,
            gy_box2,
            slot_size,
            accent_color,
            BADGE_BG,
            MC_GOLD,
            font_qty,
            font_qty_sm,
            draw_centered_text,
        )

    return img


if __name__ == "__main__":
    img_transparent = build_layout(transparent_game_box=True)
    out_transparent = os.path.join(WORKSPACE, "public/obs-layout-vertical.png")
    img_transparent.save(out_transparent, "PNG")

    img_preview = build_layout(transparent_game_box=False)
    out_preview = os.path.join(WORKSPACE, "public/obs-layout-preview.png")
    img_preview.save(out_preview, "PNG")

    if os.path.exists(ARTIFACT_DIR):
        img_transparent.save(os.path.join(ARTIFACT_DIR, "obs-layout-vertical.png"), "PNG")
        img_preview.save(os.path.join(ARTIFACT_DIR, "obs-layout-preview.png"), "PNG")
    print("Updated OBS layouts (Follow & Likes at top):", out_transparent, out_preview)
