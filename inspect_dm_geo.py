import urllib.request, json, os

RAW_BASE = 'https://raw.githubusercontent.com/DragonMounts-Team/DragonMounts-Bedrock/main'
RES = 'JUN06LeefySpawners RES'
req_headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json'}

def fetch(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    print(f"  OK ({size:,} bytes): {dest}")

# Parse the geo
print("=== Geo info ===")
with open(f"{RES}/models/entity/dragonstill.geo.json") as f:
    geo = json.load(f)

desc = geo['minecraft:geometry'][0]['description']
print(f"Identifier: {desc.get('identifier')}")
print(f"Texture size: {desc.get('texturewidth')}x{desc.get('textureheight')}")

# Animation names
print("\n=== Animation names ===")
with open(f"{RES}/animations/dragonstill.animation.json") as f:
    anims = json.load(f)
for name in anims.get('animations', {}).keys():
    print(f"  {name}")

# Get texture files list from the repo
print("\n=== Texture files ===")
try:
    tex_url = 'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/textures/entity'
    req = urllib.request.Request(tex_url, headers=req_headers)
    r = urllib.request.urlopen(req, timeout=10)
    items = json.loads(r.read())
    for item in items:
        print(f"  {item['name']} ({item['type']})")
        if item['type'] == 'dir':
            try:
                req2 = urllib.request.Request(item['url'], headers=req_headers)
                r2 = urllib.request.urlopen(req2, timeout=10)
                sub = json.loads(r2.read())
                for s in sub:
                    print(f"    {s['name']}")
            except: pass
except Exception as e:
    print(f"Error: {e}")
