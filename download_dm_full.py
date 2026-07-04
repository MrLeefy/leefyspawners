import urllib.request, json, os

RAW_BASE = 'https://raw.githubusercontent.com/DragonMounts-Team/DragonMounts-Bedrock/main'
RES = 'JUN06LeefySpawners RES'
req_headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json'}

def fetch(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    print(f"  OK ({size:,} bytes): {dest}")

# Download ender dragon texture
print("=== Textures ===")
fetch(
    f"{RAW_BASE}/dmRP/textures/entitys/ender_dragon/ender_dragon.png",
    f"{RES}/textures/entity/dragon/dragonstill.png"
)

# Also grab the render controller
print("\n=== Render controllers ===")
req = urllib.request.Request(
    'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/render_controllers',
    headers=req_headers
)
r = urllib.request.urlopen(req, timeout=10)
rc_files = json.loads(r.read())
for f in rc_files:
    print(f"  {f['name']}")

# Get the main dragon render controller
for f in rc_files:
    if 'dragon' in f['name'].lower() and 'cannon' not in f['name'].lower():
        dest = f"dm_rc_{f['name']}"
        fetch(f"{RAW_BASE}/dmRP/render_controllers/{f['name']}", dest)
        with open(dest) as fp:
            rc_data = json.load(fp)
        print(f"  RC keys: {list(rc_data.get('render_controllers', {}).keys())}")

# Also fetch the animation controller
print("\n=== Animation controllers ===")
req2 = urllib.request.Request(
    'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/animation_controllers',
    headers=req_headers
)
r2 = urllib.request.urlopen(req2, timeout=10)
ac_files = json.loads(r2.read())
for f in ac_files:
    print(f"  {f['name']}")
    if 'dragon' in f['name'].lower() and 'cannon' not in f['name'].lower():
        dest = f"dm_ac_{f['name']}"
        fetch(f"{RAW_BASE}/dmRP/animation_controllers/{f['name']}", dest)
        with open(dest) as fp:
            ac_data = json.load(fp)
        print(f"    AC keys: {list(ac_data.get('animation_controllers', {}).keys())[:5]}")

# Also check the entity definition to understand the full setup
print("\n=== Entity files ===")
req3 = urllib.request.Request(
    'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/entity',
    headers=req_headers
)
r3 = urllib.request.urlopen(req3, timeout=10)
ent_files = json.loads(r3.read())
for f in ent_files:
    print(f"  {f['name']}")
    dest = f"dm_ent_{f['name']}"
    fetch(f"{RAW_BASE}/dmRP/entity/{f['name']}", dest)
