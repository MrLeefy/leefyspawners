"""
Generate proper entity face spawner textures.

The spawner texture is 64x64. It's a cage with transparent holes.
The entity face is pasted UNDER the cage so it shows through the holes.

Face UV regions on the 64x64 cage texture (box UV for 16x16x16 cube at uv 0,0):
  Top:    x=16-32, y=0-16
  Front:  x=16-32, y=16-32   <- most visible
  Right:  x=0-16,  y=16-32
  Left:   x=32-48, y=16-32
  Back:   x=48-64, y=16-32
"""
from PIL import Image, ImageFilter
import numpy as np
import os

SRC = r"C:\Users\baseb\.gemini\antigravity\scratch\leefyspawners\JUN06LeefySpawners RES\textures"
BLOCKS = os.path.join(SRC, "blocks")
ENTITY = os.path.join(SRC, "entity")

def build_spawner(cage_path, face_img, out_path, face_scale=2.0):
    """
    Composite entity face behind the cage bars.
    - cage_path: base cage texture with transparent holes
    - face_img: entity face PIL image (will be tiled to all 4 sides + top)
    - face_scale: scale factor to zoom in on face
    """
    cage = Image.open(cage_path).convert("RGBA")
    cage_arr = np.array(cage)
    
    # Scale face to 16x16
    face_16 = face_img.resize((16, 16), Image.NEAREST)
    
    # Face positions: (x_start, y_start)
    # Use all 4 sides + top so every side shows the face
    face_positions = [
        (16, 0),   # top
        (16, 16),  # front  
        (0,  16),  # right
        (32, 16),  # left
        (48, 16),  # back
    ]
    
    # Build face layer: paste face at each position
    face_layer = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    for (fx, fy) in face_positions:
        # Check if this region has any cage data
        cage_region = cage_arr[fy:fy+16, fx:fx+16]
        if np.any(cage_region[:,:,3] > 0):
            face_layer.paste(face_16, (fx, fy))
    
    # Composite: face underneath, cage on top
    result = Image.alpha_composite(face_layer, cage)
    result.save(out_path)
    print(f"  Saved: {os.path.basename(out_path)}")
    return result

# =============================================================================
# VILLAGER SPAWNER
# Face is at (8, 8) to (16, 16) on villager.png (standard Minecraft skin layout)
# =============================================================================
print("\n=== VILLAGER SPAWNER ===")
villager_skin = Image.open(os.path.join(ENTITY, "villager2", "villager.png")).convert("RGBA")
# Standard Minecraft face = (8,8) -> (16,16) = 8x8 pixels
villager_face = villager_skin.crop((8, 8, 16, 16))
print(f"  Face crop from villager.png at (8,8)-(16,16): {villager_face.size}")

# Preview
villager_face.resize((128, 128), Image.NEAREST).save("villager_face_final_preview.png")

build_spawner(
    os.path.join(BLOCKS, "zombiespawner.png"),
    villager_face,
    os.path.join(BLOCKS, "villagerspawner.png"),
)

# =============================================================================
# ENDER DRAGON SPAWNER  
# Dragon texture is 256x256. The dragon head front face region:
# Based on vanilla dragon.tga UV map, the head scales at roughly x=0-28, y=88-112
# Let's check multiple regions and pick the best
# =============================================================================
print("\n=== ENDER DRAGON SPAWNER ===")
dragon_tex = Image.open(os.path.join(ENTITY, "dragon", "dragon.tga")).convert("RGBA")
w, h = dragon_tex.size
print(f"  Dragon texture size: {w}x{h}")

# Dragon head in Bedrock/vanilla: looking at the geo, head face is roughly:
# The dragon geo face (head front) maps to approx (0, 88) size (28, 28) on 256px texture
# But for a spawner icon, let's use the most recognizable region
# Looking at vanilla dragon.tga - the face/head area is top-left around:
# x=0-28 (of 256) = 0-11% width
# y=88-116 (of 256) = 34-45% height  (this is where the head texture is)

# Try a few crops and pick visually best
candidates = {
    "head_front":   (0, 88, 28, 116),    # estimated head front face
    "eye_region":   (0, 100, 28, 128),   # slightly lower
    "top_left":     (0, 0, 32, 32),      # top left of texture
    "mouth":        (0, 64, 64, 128),    # broader head region
}

# Check which regions actually have opaque pixels
dragon_arr = np.array(dragon_tex)
for name, (x1, y1, x2, y2) in candidates.items():
    region = dragon_arr[y1:y2, x1:x2]
    opaque = np.sum(region[:,:,3] > 128)
    avg_rgb = region[region[:,:,3] > 128].mean(axis=0)[:3] if opaque > 0 else [0,0,0]
    print(f"  {name}: {opaque} opaque px, avg RGB={avg_rgb.astype(int)}")
    # Save preview
    crop = dragon_tex.crop((x1, y1, x2, y2))
    crop.resize((128, 128), Image.NEAREST).save(f"dragon_{name}_preview.png")

print("  Check dragon_*_preview.png files to pick best face region")
