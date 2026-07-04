"""
Final spawner texture generator.

Villager: uses actual face from villager.png skin
Ender Dragon: programmatically draws a dragon face icon (since dragon.tga is near-black and looks terrible at 16x16)
"""
from PIL import Image, ImageDraw
import numpy as np
import os

SRC = r"C:\Users\baseb\.gemini\antigravity\scratch\leefyspawners\JUN06LeefySpawners RES\textures"
BLOCKS = os.path.join(SRC, "blocks")
ENTITY = os.path.join(SRC, "entity")
CAGE = os.path.join(BLOCKS, "zombiespawner.png")

def build_spawner(cage_path, face_img, out_path):
    cage = Image.open(cage_path).convert("RGBA")
    cage_arr = np.array(cage)
    face_16 = face_img.resize((16, 16), Image.NEAREST)
    
    face_positions = [(16, 0), (16, 16), (0, 16), (32, 16), (48, 16)]
    face_layer = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    for (fx, fy) in face_positions:
        if np.any(cage_arr[fy:fy+16, fx:fx+16, 3] > 0):
            face_layer.paste(face_16, (fx, fy))
    
    result = Image.alpha_composite(face_layer, cage)
    result.save(out_path)
    print(f"  Saved: {os.path.basename(out_path)}")


# =============================================================================
# VILLAGER SPAWNER - real skin face at (8,8)-(16,16)
# =============================================================================
print("\n=== VILLAGER SPAWNER ===")
villager_skin = Image.open(os.path.join(ENTITY, "villager2", "villager.png")).convert("RGBA")
villager_face = villager_skin.crop((8, 8, 16, 16))  # standard Minecraft face UV
build_spawner(CAGE, villager_face, os.path.join(BLOCKS, "villagerspawner.png"))

# =============================================================================
# ENDER DRAGON SPAWNER - draw a custom dragon face icon (8x8)
# Purple/void aesthetic, recognizable dragon silhouette
# =============================================================================
print("\n=== ENDER DRAGON SPAWNER (custom icon) ===")

# Draw an 8x8 dragon face pixel art
# Color palette
VOID  = (10, 5, 20, 255)     # deep void black
PURP  = (100, 20, 160, 255)  # main dragon purple  
LPURP = (160, 60, 220, 255)  # lighter purple highlight
EYE   = (230, 140, 255, 255) # bright purple eye glow
HORN  = (80, 15, 130, 255)   # dark horn

# 8x8 dragon face grid (row by row, top to bottom)
# H=horn, P=purple body, L=light, E=eye, V=void/dark, 
grid = [
    [HORN,  VOID,  VOID,  PURP,  PURP,  VOID,  VOID,  HORN],  # row 0: horns
    [VOID,  HORN,  PURP,  LPURP, LPURP, PURP,  HORN,  VOID],  # row 1: head top
    [VOID,  PURP,  LPURP, PURP,  PURP,  LPURP, PURP,  VOID],  # row 2: brow
    [PURP,  PURP,  EYE,   VOID,  VOID,  EYE,   PURP,  PURP],  # row 3: eyes
    [PURP,  LPURP, VOID,  VOID,  VOID,  VOID,  LPURP, PURP],  # row 4: mid face
    [PURP,  PURP,  PURP,  HORN,  HORN,  PURP,  PURP,  PURP],  # row 5: snout
    [VOID,  PURP,  HORN,  PURP,  PURP,  HORN,  PURP,  VOID],  # row 6: jaw
    [VOID,  VOID,  PURP,  VOID,  VOID,  PURP,  VOID,  VOID],  # row 7: chin
]

dragon_face = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
pixels = dragon_face.load()
for y, row in enumerate(grid):
    for x, color in enumerate(row):
        pixels[x, y] = color

# Save preview
dragon_face.resize((128, 128), Image.NEAREST).save("dragon_face_icon_preview.png")
print("  Dragon face icon preview saved")

build_spawner(CAGE, dragon_face, os.path.join(BLOCKS, "enderdragonspawner.png"))

print("\nDone!")
