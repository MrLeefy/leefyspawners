import urllib.request, json, os

req_headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json'}
RAW_BASE = 'https://raw.githubusercontent.com/DragonMounts-Team/DragonMounts-Bedrock/main'

def fetch_raw(path, dest):
    url = f"{RAW_BASE}/{path}"
    urllib.request.urlretrieve(url, dest)
    return dest

# Check the default*.json and model*.json files - these are likely the main dragon models
plain_files = ['default.json', 'default1.json', 'default2.json', 'default3.json', 'glow.json', 'model (2).json', 'dragon_keeper.json', 'none.geo.json']

print("=== Checking all model files for tail bones ===")
for fname in plain_files:
    dest = f"dm_check_{fname.replace(' ', '_')}"
    try:
        fetch_raw(f"dmRP/models/entity/{fname}", dest)
        with open(dest) as f:
            raw = f.read()
        
        # Try parsing as geo.json
        try:
            data = json.loads(raw)
        except:
            print(f"  {fname}: not valid JSON")
            continue
        
        # Check for minecraft:geometry format
        if 'minecraft:geometry' in data:
            bones = data['minecraft:geometry'][0].get('bones', [])
            bone_names = [b['name'] for b in bones]
            tail_bones = [b for b in bone_names if 'tail' in b.lower()]
            print(f"  {fname}: {len(bones)} bones, tail: {tail_bones}")
            if tail_bones:
                print(f"    *** HAS TAIL BONES! ***")
                print(f"    All bones: {bone_names}")
        else:
            # Maybe it's a different format
            top_keys = list(data.keys())[:5]
            print(f"  {fname}: keys={top_keys}")
    except Exception as e:
        print(f"  {fname}: ERROR - {e}")

# Also check the DM Legacy RP which might have the original ender dragon model
print("\n=== DM Legacy RP ===")
try:
    legacy = urllib.request.Request(
        'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/DM Legacy RP/models/entity',
        headers=req_headers
    )
    r = urllib.request.urlopen(legacy, timeout=10)
    files = json.loads(r.read())
    for f in files:
        print(f"  {f['name']}")
except Exception as e:
    print(f"  Error: {e}")
    # Try URL-encoded
    try:
        legacy2 = urllib.request.Request(
            'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/DM%20Legacy%20RP',
            headers=req_headers
        )
        r2 = urllib.request.urlopen(legacy2, timeout=10)
        files2 = json.loads(r2.read())
        for f in files2:
            print(f"  {f['name']} ({f['type']})")
    except Exception as e2:
        print(f"  Also failed: {e2}")
