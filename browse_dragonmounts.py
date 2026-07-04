import urllib.request, json

req_headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github+json'}

def browse(url):
    req = urllib.request.Request(url, headers=req_headers)
    r = urllib.request.urlopen(req, timeout=10)
    return json.loads(r.read())

# Find the root first
print("=== Repo root ===")
data = browse('https://api.github.com/repos/DragonMounts-Team/DragonMounts-Bedrock/contents')
for item in data:
    print(f"  {item['name']} ({item['type']})")

# Then drill into the RP folder
print("\n=== Looking for RP folder ===")
rp_dirs = [item for item in data if item['type'] == 'dir']
for d in rp_dirs:
    try:
        sub = browse(d['url'])
        for item in sub:
            if item['name'] in ('models', 'animations', 'entity'):
                print(f"  {d['name']}/{item['name']}/")
    except Exception as e:
        print(f"  Error browsing {d['name']}: {e}")
