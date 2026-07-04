"""
Download official Bedrock vanilla assets from Mojang bedrock-samples:
  - ender_dragon.geo.json -> models/entity/enderdragonstill.geo.json & enderdragonstill_display.geo.json
  - villager2 textures -> textures/entity/villager2/...
"""
import urllib.request
import json
import os
import shutil

BASE = r"JUN06LeefySpawners RES"
BASE_RAW = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack"
BASE_API = "https://api.github.com/repos/Mojang/bedrock-samples/contents/resource_pack"

def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  Downloading: {os.path.basename(dest)}")
    try:
        urllib.request.urlretrieve(url, dest)
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False

def list_github_dir(api_path):
    url = f"{BASE_API}/{api_path}"
    r = urllib.request.urlopen(url)
    return json.loads(r.read())

# ─────────────────────────────────────────────────────────────────────────────
# 1. ENDER DRAGON GEOMETRY
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== ENDER DRAGON GEOMETRY ===")

dragon_geo_url = f"{BASE_RAW}/models/entity/ender_dragon.geo.json"
dragon_geo_raw = "ender_dragon_vanilla.geo.json"

# Read the vanilla geo and adapt for our custom identifier
with open(dragon_geo_raw, "r", encoding="utf-8") as f:
    geo_data = json.load(f)

# The vanilla format uses 1.12.0 format: { "minecraft:geometry": [...] }
# We need to keep geometry.dragon identifier but save as our filenames
geo_json_out = json.dumps(geo_data, indent=2)

# Write as enderdragonstill.geo.json  
geo_out_path = os.path.join(BASE, "models", "entity", "enderdragonstill.geo.json")
with open(geo_out_path, "w", encoding="utf-8") as f:
    f.write(geo_json_out)
print(f"  Saved: enderdragonstill.geo.json ({len(geo_json_out)} bytes)")

# Write as enderdragonstill_display.geo.json (same geometry, referenced by display entity)
geo_display_out_path = os.path.join(BASE, "models", "entity", "enderdragonstill_display.geo.json")
with open(geo_display_out_path, "w", encoding="utf-8") as f:
    f.write(geo_json_out)
print(f"  Saved: enderdragonstill_display.geo.json ({len(geo_json_out)} bytes)")

# ─────────────────────────────────────────────────────────────────────────────
# 2. VILLAGER2 TEXTURES
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== VILLAGER2 TEXTURES ===")

# Root base texture
base_tex_dir = os.path.join(BASE, "textures", "entity", "villager2")
os.makedirs(base_tex_dir, exist_ok=True)

root_files = ["villager.png", "villager_baby.png"]
for fname in root_files:
    url = f"{BASE_RAW}/textures/entity/villager2/{fname}"
    dest = os.path.join(base_tex_dir, fname)
    if not os.path.exists(dest):
        download(url, dest)
    else:
        print(f"  Already exists: {fname}")

# Subdirectories with their files
subdirs = {
    "biomes": ["desert.png", "jungle.png", "plains.png", "savanna.png", "snow.png", "swamp.png", "taiga.png"],
    "professions": [
        "armorer.png", "butcher.png", "cartographer.png", "cleric.png",
        "farmer.png", "fisherman.png", "fletcher.png", "leatherworker.png",
        "librarian.png", "nitwit.png", "shepherd.png", "stonemason.png",
        "toolsmith.png", "weaponsmith.png", "unskilled.png"
    ],
    "levels": ["level_stone.png", "level_iron.png", "level_gold.png", "level_emerald.png", "level_diamond.png"]
}

for subdir, files in subdirs.items():
    print(f"\n  Downloading {subdir}/...")
    dest_dir = os.path.join(base_tex_dir, subdir)
    os.makedirs(dest_dir, exist_ok=True)
    for fname in files:
        url = f"{BASE_RAW}/textures/entity/villager2/{subdir}/{fname}"
        dest = os.path.join(dest_dir, fname)
        if not os.path.exists(dest):
            download(url, dest)
        else:
            print(f"    Already exists: {fname}")

print("\n=== DONE — All vanilla assets downloaded! ===")
