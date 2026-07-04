import urllib.request, json, os

BASE_RAW = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack'
BASE_RES = r'JUN06LeefySpawners RES'

# Check what dragon textures exist
url = 'https://api.github.com/repos/Mojang/bedrock-samples/contents/resource_pack/textures/entity/dragon'
r = urllib.request.urlopen(url)
files = json.loads(r.read())
print('Dragon textures on GitHub:')
for f in files:
    print(' ', f['name'])

# Download dragon textures into our res pack
dest_dir = os.path.join(BASE_RES, 'textures', 'entity', 'dragon')
os.makedirs(dest_dir, exist_ok=True)
for f in files:
    name = f['name']
    if name.endswith('.png') or name.endswith('.tga'):
        dest = os.path.join(dest_dir, name)
        if not os.path.exists(dest):
            print('Downloading', name, '...')
            urllib.request.urlretrieve(BASE_RAW + '/textures/entity/dragon/' + name, dest)
            print('  OK')
        else:
            print('  Already exists:', name)
