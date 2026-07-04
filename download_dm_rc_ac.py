import urllib.request, json, os

RAW_BASE = 'https://raw.githubusercontent.com/DragonMounts-Team/DragonMounts-Bedrock/main'
RES = 'JUN06LeefySpawners RES'
req_headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json'}

def browse(url):
    req = urllib.request.Request(url, headers=req_headers)
    r = urllib.request.urlopen(req, timeout=10)
    return json.loads(r.read())

def fetch(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    print(f"  OK ({size:,} bytes): {dest}")

# RC is in a subfolder 'dragons'
print("=== dmRP/render_controllers/dragons/ ===")
items = browse('https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/render_controllers/dragons')
for item in items:
    print(f"  {item['name']}")
    dest = f"dm_rc_{item['name']}"
    fetch(f"{RAW_BASE}/dmRP/render_controllers/dragons/{item['name']}", dest)

print("\n=== dmRP/animation_controllers/ ===")
items2 = browse('https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/animation_controllers')
for item in items2:
    print(f"  {item['name']} ({item['type']})")
    if item['type'] == 'file' and 'dragon' in item['name'].lower():
        dest = f"dm_ac_{item['name']}"
        fetch(f"{RAW_BASE}/dmRP/animation_controllers/{item['name']}", dest)
    elif item['type'] == 'dir':
        sub = browse(item['url'])
        for s in sub:
            print(f"    {s['name']}")
            dest = f"dm_ac_{s['name']}"
            fetch(f"{RAW_BASE}/dmRP/animation_controllers/{item['name']}/{s['name']}", dest)

print("\n=== dmRP/entity/ ===")
items3 = browse('https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/entity')
for item in items3:
    print(f"  {item['name']}")
    dest = f"dm_ent_{item['name']}"
    fetch(f"{RAW_BASE}/dmRP/entity/{item['name']}", dest)
    # Show relevant section
    try:
        with open(dest) as f:
            d = json.load(f)
        if 'minecraft:client_entity' in d:
            desc = d['minecraft:client_entity']['description']
            ident = desc.get('identifier', '')
            if 'dragon' in ident.lower():
                print(f"    identifier: {ident}")
                print(f"    geometry: {desc.get('geometry', {})}")
                print(f"    textures: {list(desc.get('textures', {}).keys())}")
                print(f"    render_controllers: {desc.get('render_controllers', [])}")
    except: pass
