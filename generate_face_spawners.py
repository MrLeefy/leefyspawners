"""
Generate proper entity-face spawner block textures for Villager and Ender Dragon.

The spawner texture is 64x64. The cube has box UV starting at (0,0):
- Top face:   x=16-32, y=0-16
- Front face: x=16-32, y=16-32
- Right face: x=0-16,  y=16-32
- Left face:  x=32-48, y=16-32
- Back face:  x=48-64, y=16-32

The approach:
1. Start with a base cage texture (zombie spawner)
2. Extract the entity face from their skin texture
3. Paste the face into each side face region, BEHIND the cage bars
4. The cage bars (semi-transparent/alpha pixels) overlay the face naturally
"""
from PIL import Image
import numpy as np
import os

SRC = r"C:\Users\baseb\.gemini\antigravity\scratch\leefyspawners\JUN06LeefySpawners RES\textures"
BLOCKS = os.path.join(SRC, "blocks")
ENTITY = os.path.join(SRC, "entity")

def get_base_cage():
    """Get the raw cage texture from zombie spawner as base."""
    # Use zombie as cage base - it already has correct cage pattern
    return Image.open(os.path.join(BLOCKS, "zombiespawner.png")).convert("RGBA")

def build_spawner_with_face(cage_img, face_img, out_path, tint_rgb=None):
    """
    Composite entity face behind cage bars.
    cage_img: the 64x64 cage RGBA texture
    face_img: an 8x8 (or 16x16) face RGBA crop from entity skin
    """
    result = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    cage_arr = np.array(cage_img)
    
    # Scale face to 16x16
    face_16 = face_img.resize((16, 16), Image.NEAREST)
    
    if tint_rgb:
        # Apply slight tint to face
        face_arr = np.array(face_16).astype(float)
        r, g, b = tint_rgb
        face_arr[:,:,0] = np.clip(face_arr[:,:,0] * (r/255)*1.2, 0, 255)
        face_arr[:,:,1] = np.clip(face_arr[:,:,1] * (g/255)*1.2, 0, 255)
        face_arr[:,:,2] = np.clip(face_arr[:,:,2] * (b/255)*1.2, 0, 255)
        face_16 = Image.fromarray(face_arr.astype(np.uint8))
    
    # Face regions in the 64x64 texture (x_start, y_start)
    face_positions = [
        (16, 0),   # top
        (16, 16),  # front
        (0, 16),   # right
        (32, 16),  # left
        (48, 16),  # back
    ]
    
    # Build base: paste face in each face position, then overlay cage
    base = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    
    for (fx, fy) in face_positions:
        # Only paste where cage has opaque pixels (within that face region)
        cage_face_region = cage_arr[fy:fy+16, fx:fx+16]
        has_data = np.any(cage_face_region[:,:,3] > 0)
        if has_data:
            # Make face fully opaque where cage has any pixel
            face_copy = face_16.copy()
            base.paste(face_copy, (fx, fy))
    
    # Now composite: face on bottom, cage bars on top
    # The cage has transparent gaps where face shows through, opaque dark cage bars on top
    result = Image.alpha_composite(base, cage_img)
    result.save(out_path)
    print(f"  Saved: {os.path.basename(out_path)}")

# =============================================================================
# VILLAGER SPAWNER - Use villager face from villager2/villager.png
# =============================================================================
print("\n=== VILLAGER SPAWNER ===")

# Villager skin is at textures/entity/villager2/villager.png
# Villager2 skin is 64x64, face is at top-left: x=0-8, y=0-8 (8x8 face)
villager_skin_path = os.path.join(ENTITY, "villager2", "villager.png")

if os.path.exists(villager_skin_path):
    villager_skin = Image.open(villager_skin_path).convert("RGBA")
    print(f"  Villager skin size: {villager_skin.size}")
    # Villager v2 face is at (0, 0) size (8, 8)
    face = villager_skin.crop((0, 0, 8, 8))
    
    cage = get_base_cage()
    out = os.path.join(BLOCKS, "villagerspawner.png")
    build_spawner_with_face(cage, face, out)
else:
    print(f"  ERROR: villager skin not found at {villager_skin_path}")

# =============================================================================
# ENDER DRAGON SPAWNER - Use dragon head from dragon.tga
# =============================================================================
print("\n=== ENDER DRAGON SPAWNER ===")

dragon_tex_path = os.path.join(ENTITY, "dragon", "dragon.tga")

if os.path.exists(dragon_tex_path):
    dragon_skin = Image.open(dragon_tex_path).convert("RGBA")
    print(f"  Dragon skin size: {dragon_skin.size}")
    
    # Dragon texture is 256x256. Head face region is approximately:
    # Based on vanilla dragon texture: head is around x=0-56, y=0-56 area
    # The front face of the head is roughly x=0-28, y=8-28 (proportional to 256px width)
    # Let's crop a reasonable head region
    w, h = dragon_skin.size
    # Dragon head texture area (approximate for vanilla 256x256 texture)
    # Head is in top-left quadrant roughly
    head_x = int(w * 0.0)
    head_y = int(h * 0.0)
    head_w = int(w * 0.12)  # ~30px of 256
    head_h = int(h * 0.12)
    
    face = dragon_skin.crop((head_x, head_y, head_x + head_w, head_y + head_h))
    print(f"  Dragon face crop: {face.size}")
    
    cage = get_base_cage()
    out = os.path.join(BLOCKS, "enderdragonspawner.png")
    # Tint with purple
    build_spawner_with_face(cage, face, out, tint_rgb=(180, 100, 255))
else:
    print(f"  ERROR: dragon texture not found at {dragon_tex_path}")
    # Fallback: generate purple cage manually
    from generate_spawner_textures import recolor_spawner
    base = os.path.join(BLOCKS, "blazespawner.png")
    out = os.path.join(BLOCKS, "enderdragonspawner.png")
    recolor_spawner(base, out, target_hue_rgb=(100, 20, 160))

print("\n=== Preview face crops ===")
if os.path.exists(villager_skin_path):
    v = Image.open(villager_skin_path).convert("RGBA")
    face = v.crop((0, 0, 8, 8)).resize((64, 64), Image.NEAREST)
    face.save("villager_face_preview.png")
    print("  Saved villager_face_preview.png")

if os.path.exists(dragon_tex_path):
    d = Image.open(dragon_tex_path).convert("RGBA")
    w, h = d.size
    face = d.crop((0, 0, int(w*0.12), int(h*0.12))).resize((64, 64), Image.NEAREST)
    face.save("dragon_face_preview.png")
    print("  Saved dragon_face_preview.png")
