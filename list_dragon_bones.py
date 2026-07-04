import json
geo = json.load(open('JUN06LeefySpawners RES/models/entity/enderdragonstill.geo.json'))
bones = geo['minecraft:geometry'][0]['bones']
print(f'Total bones: {len(bones)}')
for b in bones:
    parent = b.get('parent', '-')
    print(f"  {b['name']} (parent: {parent})")
