import os, json, glob

BEH = 'JUN06LeefySpawners BEH'

fixed = 0
for path in glob.glob(f'{BEH}/entities/**/*.json', recursive=True):
    try:
        with open(path, encoding='utf-8') as f:
            d = json.load(f)
    except Exception as e:
        print(f'SKIP (parse error) {path}: {e}')
        continue

    desc = d.get('minecraft:entity', {}).get('description', {})
    anims = desc.get('animations', {})
    scripts = desc.get('scripts', {})
    animate = scripts.get('animate', [])

    changed = False

    # Remove 'start' and 'bridge_execute_commands' from animations dict
    for key in ['start', 'bridge_execute_commands']:
        if key in anims:
            del anims[key]
            changed = True

    # Remove them from the animate list too
    new_animate = []
    for item in animate:
        if isinstance(item, str) and item in ('start', 'bridge_execute_commands'):
            changed = True
            continue
        elif isinstance(item, dict):
            # {"start": "..."} form
            filtered = {k: v for k, v in item.items() if k not in ('start', 'bridge_execute_commands')}
            if filtered != item:
                changed = True
            if filtered:
                new_animate.append(filtered)
            continue
        new_animate.append(item)

    if changed:
        scripts['animate'] = new_animate
        if not anims:
            desc.pop('animations', None)
        if not new_animate and not any(k for k in scripts if k != 'animate'):
            desc.pop('scripts', None)
        elif not new_animate:
            scripts.pop('animate', None)

        with open(path, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=4)
        print(f'Fixed: {os.path.basename(path)}')
        fixed += 1

print(f'\nTotal fixed: {fixed}')
