import urllib.request, json, os

req_headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json'}
RAW_BASE = 'https://raw.githubusercontent.com/DragonMounts-Team/DragonMounts-Bedrock/main'

def browse(url):
    req = urllib.request.Request(url, headers=req_headers)
    r = urllib.request.urlopen(req, timeout=10)
    return json.loads(r.read())

def fetch_raw(path, dest):
    url = f"{RAW_BASE}/{path}"
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    print(f"  Downloaded ({size} bytes): {dest}")
    return dest

# List models/entity
print("=== dmRP/models/entity/ ===")
models = browse('https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/models/entity')
for item in models:
    print(f"  {item['name']}")

print("\n=== dmRP/animations/ ===")
anims = browse('https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/animations')
for item in anims:
    print(f"  {item['name']}")

# Find the ender dragon geo specifically
print("\n=== Checking for ender dragon geo ===")
geo_files = [item for item in models if 'dragon' in item['name'].lower() and item['name'].endswith('.geo.json')]
print(f"Dragon geo files: {[f['name'] for f in geo_files]}")

# Download and check each for tail bones
for geo_file in geo_files:
    dest = f"dm_{geo_file['name']}"
    fetch_raw(f"dmRP/models/entity/{geo_file['name']}", dest)
    
    with open(dest) as f:
        data = json.load(f)
    
    bones = data.get('minecraft:geometry', [{}])[0].get('bones', [])
    bone_names = [b['name'] for b in bones]
    tail_bones = [b for b in bone_names if 'tail' in b.lower()]
    print(f"  {geo_file['name']}: {len(bones)} bones, tail bones: {tail_bones}")

# Also check animations
print("\n=== Checking dragon animations ===")
anim_files = [item for item in anims if 'dragon' in item['name'].lower()]
print(f"Dragon anim files: {[f['name'] for f in anim_files]}")
for anim_file in anim_files[:3]:  # limit to first 3
    dest = f"dm_{anim_file['name']}"
    fetch_raw(f"dmRP/animations/{anim_file['name']}", dest)
    with open(dest) as f:
        data = json.load(f)
    anim_names = list(data.get('animations', {}).keys())
    print(f"  {anim_file['name']}: {anim_names}")
