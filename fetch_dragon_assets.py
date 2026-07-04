import urllib.request, json, os

BASE_RAW = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack'
RES = r'JUN06LeefySpawners RES'

def fetch(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    print(f'  OK ({size} bytes): {os.path.basename(dest)}')

# Dragon animations
print('=== Dragon Animations ===')
dest = os.path.join(RES, 'animations', 'ender_dragon.animation.json')
fetch(BASE_RAW + '/animations/ender_dragon.animation.json', dest)

# Parse and show animation names
with open(dest) as f:
    anim_data = json.load(f)
anims = list(anim_data.get('animations', {}).keys())
print(f'  Found {len(anims)} animations:')
for a in anims:
    print(f'    {a}')

# Dragon render controller
print('\n=== Render Controllers ===')
url = 'https://api.github.com/repos/Mojang/bedrock-samples/contents/resource_pack/render_controllers'
r = urllib.request.urlopen(url)
files = json.loads(r.read())
dragon_rcs = [f for f in files if 'dragon' in f['name'].lower()]
print('Dragon render controllers:', [f['name'] for f in dragon_rcs])

for f in dragon_rcs:
    dest_rc = os.path.join(RES, 'render_controllers', f['name'])
    fetch(BASE_RAW + '/render_controllers/' + f['name'], dest_rc)
    with open(dest_rc) as fp:
        rc_data = json.load(fp)
    print(json.dumps(rc_data, indent=2)[:1000])

# Dragon eyes texture
print('\n=== Dragon Eyes Texture ===')
dest_eyes = os.path.join(RES, 'textures', 'entity', 'dragon', 'dragon_eyes.png')
fetch(BASE_RAW + '/textures/entity/dragon/dragon_eyes.png', dest_eyes)

# Animation controllers for dragon
print('\n=== Animation Controllers ===')
url2 = 'https://api.github.com/repos/Mojang/bedrock-samples/contents/resource_pack/animation_controllers'
r2 = urllib.request.urlopen(url2)
files2 = json.loads(r2.read())
dragon_acs = [f for f in files2 if 'dragon' in f['name'].lower()]
print('Dragon AC files:', [f['name'] for f in dragon_acs])
for f in dragon_acs:
    dest_ac = os.path.join(RES, 'animation_controllers', f['name'])
    fetch(BASE_RAW + '/animation_controllers/' + f['name'], dest_ac)
