import urllib.request, json, os, shutil

RAW_BASE = 'https://raw.githubusercontent.com/DragonMounts-Team/DragonMounts-Bedrock/main'
RES = 'JUN06LeefySpawners RES'

def fetch(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    print(f"  OK ({size:,} bytes): {dest}")

print("=== Downloading DragonMounts dragon assets (GPL-3.0) ===")

# 1. Main dragon geo (default.json = 91 bones including full tail)
fetch(
    f"{RAW_BASE}/dmRP/models/entity/default.json",
    f"{RES}/models/entity/dragonstill.geo.json"
)

# 2. Main animation file
fetch(
    f"{RAW_BASE}/dmRP/animations/mountdragon_defaultdm1.animation.json",
    f"{RES}/animations/dragonstill.animation.json"
)

# 3. Entity definition from dmRP to see what texture it uses
req_headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json'}
entity_url = 'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/entity'
req = urllib.request.Request(entity_url, headers=req_headers)
r = urllib.request.urlopen(req, timeout=10)
entity_files = json.loads(r.read())
print("\n=== dmRP/entity/ files ===")
for f in entity_files:
    print(f"  {f['name']}")
    if 'dragon' in f['name'].lower() and 'client' not in f['name'].lower():
        dest = f"dm_entity_{f['name']}"
        fetch(f"{RAW_BASE}/dmRP/entity/{f['name']}", dest)

# 4. Check what texture files the dragon uses
print("\n=== dmRP/textures/entity/ ===")
try:
    tex_url = 'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/textures/entity'
    req2 = urllib.request.Request(tex_url, headers=req_headers)
    r2 = urllib.request.urlopen(req2, timeout=10)
    tex_files = json.loads(r2.read())
    for f in tex_files:
        print(f"  {f['name']} ({f['type']})")
except Exception as e:
    print(f"  Error: {e}")

# 5. Parse the geo to confirm identifier
with open(f"{RES}/models/entity/dragonstill.geo.json") as f:
    geo = json.load(f)

# Get the geometry identifier
for key, val in geo.items():
    if isinstance(val, str):
        print(f"\nGeo key: {key} = {val}")
    elif isinstance(val, list) and key == 'minecraft:geometry':
        desc = val[0].get('description', {})
        print(f"\nGeo identifier: {desc.get('identifier')}")
        print(f"Texture size: {desc.get('texturewidth')}x{desc.get('textureheight')}")

print("\n=== Animation names ===")
with open(f"{RES}/animations/dragonstill.animation.json") as f:
    anims = json.load(f)
for name in anims.get('animations', {}).keys():
    print(f"  {name}")
