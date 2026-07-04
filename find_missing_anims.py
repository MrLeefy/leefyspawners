import os, json, glob

RES = 'JUN06LeefySpawners RES'

entity_files = glob.glob(f'{RES}/entity/**/*.json', recursive=True)
print(f'Total entity files: {len(entity_files)}')

for path in entity_files:
    try:
        with open(path) as f:
            content = f.read()
        if 'bridge_execute_commands' in content or '"start"' in content:
            print(f'  FOUND: {os.path.basename(path)}')
            # Show the animations section
            d = json.loads(content)
            desc = d.get('minecraft:client_entity', {}).get('description', {})
            anims = desc.get('animations', {})
            scripts = desc.get('scripts', {})
            animate = scripts.get('animate', [])
            print(f'    animations keys: {list(anims.keys())}')
            print(f'    animate: {animate}')
    except Exception as e:
        print(f'  ERROR {path}: {e}')
