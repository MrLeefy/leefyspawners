import json, os, shutil

RES = 'JUN06LeefySpawners RES'

# Read the downloaded files
with open('dm_rc_dragon.json') as f:
    rc = json.load(f)
with open('dm_ac_dragon.json') as f:
    ac = json.load(f)

print("=== Render Controllers ===")
for key in rc.get('render_controllers', {}):
    rc_data = rc['render_controllers'][key]
    print(f"  {key}")
    print(f"    geometry: {rc_data.get('geometry')}")
    print(f"    materials: {rc_data.get('materials')}")
    tex = rc_data.get('textures', [])
    print(f"    textures: {tex[:3]}")

print("\n=== Animation Controllers ===")
for key in list(ac.get('animation_controllers', {}).keys())[:5]:
    print(f"  {key}")

# Now build our entity.json using this DragonMounts model
# The geo identifier from default.json is 'geometry.mountdragon_defaultdm1'
# The RC references geometry and textures we need to match

# Copy the RC file in as our render controller
os.makedirs(f'{RES}/render_controllers', exist_ok=True)
shutil.copy2('dm_rc_dragon.json', f'{RES}/render_controllers/enderdragonstill.render_controllers.json')
print(f"\nCopied render controller")

# Copy animation controller
os.makedirs(f'{RES}/animation_controllers', exist_ok=True)
shutil.copy2('dm_ac_dragon.json', f'{RES}/animation_controllers/enderdragonstill.animation_controllers.json')
print(f"Copied animation controller")

# The key config to build our entity.json
# RC key, geo identifier, texture key needed
rc_key = list(rc['render_controllers'].keys())[0]
print(f"\nRC key to use: {rc_key}")
print("Main geo identifier: geometry.mountdragon_defaultdm1")
print("Texture: textures/entity/dragon/dragonstill")
print("Animation: animation.dragondm1.on_ground (stationary pose)")
