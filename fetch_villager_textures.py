"""
Download correct official Bedrock vanilla villager2 texture assets
with the real file names, and save them into the resource pack.
Also updates the entity client definitions to use the correct paths.
"""
import urllib.request
import json
import os

BASE_RES = r"JUN06LeefySpawners RES"
BASE_RAW = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack"

def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        urllib.request.urlretrieve(url, dest)
        print(f"  OK: {os.path.relpath(dest)}")
        return True
    except Exception as e:
        print(f"  FAIL ({os.path.basename(dest)}): {e}")
        return False

tex_base = os.path.join(BASE_RES, "textures", "entity", "villager2")

# ─────────────────────────────────────────────────────────────────────────────
# Biomes - actual filenames are biome_X.png
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== BIOMES ===")
biomes = ["desert", "jungle", "plains", "savanna", "snow", "swamp", "taiga"]
for b in biomes:
    fname = f"biome_{b}.png"
    url = f"{BASE_RAW}/textures/entity/villager2/biomes/{fname}"
    dest = os.path.join(tex_base, "biomes", fname)
    download(url, dest)

# ─────────────────────────────────────────────────────────────────────────────
# Professions - actual filenames are *.tga (not .png!)
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== PROFESSIONS ===")
professions = [
    "armorer", "butcher", "cartographer", "cleric",
    "farmer", "fisherman", "fletcher", "leatherworker",
    "librarian", "nitwit", "shepherd", "stonemason",
    "toolsmith", "weaponsmith", "unskilled"
]
for p in professions:
    fname = f"{p}.tga"
    url = f"{BASE_RAW}/textures/entity/villager2/professions/{fname}"
    dest = os.path.join(tex_base, "professions", fname)
    download(url, dest)

print("\n=== DONE ===")
print("\nIMPORTANT: Now update entity JSON texture paths!")
print("  - Biomes: textures/entity/villager2/biomes/biome_desert (no extension)")
print("  - Professions: textures/entity/villager2/professions/armorer (no extension)")
print("  - Levels: textures/entity/villager2/levels/level_stone (already downloaded)")
