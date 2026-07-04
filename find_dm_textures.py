import urllib.request, json, os

RAW_BASE = 'https://raw.githubusercontent.com/DragonMounts-Team/DragonMounts-Bedrock/main'
RES = 'JUN06LeefySpawners RES'
req_headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json'}

def fetch(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    print(f"  OK ({size:,} bytes): {dest}")

# Search deeper in dmRP for textures
print("=== dmRP contents ===")
req = urllib.request.Request(
    'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP',
    headers=req_headers
)
r = urllib.request.urlopen(req, timeout=10)
items = json.loads(r.read())
for item in items:
    print(f"  {item['name']} ({item['type']})")

# Check textures folder
print("\n=== dmRP/textures ===")
try:
    req2 = urllib.request.Request(
        'https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents/dmRP/textures',
        headers=req_headers
    )
    r2 = urllib.request.urlopen(req2, timeout=10)
    items2 = json.loads(r2.read())
    for item in items2:
        print(f"  {item['name']} ({item['type']})")
        # Drill into dirs
        if item['type'] == 'dir':
            try:
                req3 = urllib.request.Request(item['url'], headers=req_headers)
                r3 = urllib.request.urlopen(req3, timeout=10)
                sub = json.loads(r3.read())
                for s in sub:
                    print(f"    {s['name']} ({s['type']})")
                    if s['type'] == 'dir':
                        req4 = urllib.request.Request(s['url'], headers=req_headers)
                        r4 = urllib.request.urlopen(req4, timeout=10)
                        sub2 = json.loads(r4.read())
                        for s2 in sub2:
                            print(f"      {s2['name']}")
            except Exception as e:
                print(f"    error: {e}")
except Exception as e:
    print(f"Error: {e}")
