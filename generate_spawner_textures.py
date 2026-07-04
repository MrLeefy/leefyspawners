"""
Generate proper, unique spawner block textures for Villager and Ender Dragon
by recoloring the base spawner cage texture using mob-appropriate colors.

Villager:  warm brown/green tradesman colors
Ender Dragon: deep purple/void colors
"""
from PIL import Image, ImageDraw, ImageEnhance
import os, shutil

SRC_DIR = r"C:\Users\baseb\.gemini\antigravity\scratch\leefyspawners\JUN06LeefySpawners RES\textures\blocks"

def analyze_texture(path):
    img = Image.open(path).convert("RGBA")
    pixels = list(img.getdata())
    unique = set()
    for r,g,b,a in pixels:
        if a > 10:
            unique.add((r,g,b))
    return img, sorted(unique)

def recolor_spawner(src_path, dest_path, target_hue_rgb, accent_rgb=None, darken=1.0):
    """
    Recolor a spawner texture by:
    1. Converting to grayscale to get luminance
    2. Tinting the spawner cage bars with target_hue_rgb
    3. Keeping transparent/black pixels as-is
    """
    img = Image.open(src_path).convert("RGBA")
    width, height = img.size
    pixels = img.load()
    
    tr, tg, tb = target_hue_rgb
    
    for x in range(width):
        for y in range(height):
            r, g, b, a = pixels[x, y]
            if a < 10:
                continue
            
            # Compute luminance (0-1)
            lum = (0.299*r + 0.587*g + 0.114*b) / 255.0
            lum *= darken
            
            # Skip very dark pixels (cage shadows/crevices) - keep them near black
            if lum < 0.12:
                nr = int(r * 0.5)
                ng = int(g * 0.5)
                nb = int(b * 0.5)
            else:
                # Tint with target color scaled by luminance
                nr = min(255, int(tr * lum * 1.5))
                ng = min(255, int(tg * lum * 1.5))
                nb = min(255, int(tb * lum * 1.5))
            
            pixels[x, y] = (nr, ng, nb, a)
    
    img.save(dest_path)
    print(f"  Saved: {os.path.basename(dest_path)}")
    return img

# Use a known good spawner texture (not zombie/netherite) as the base
# Blaze spawner is unique and good
base_spawner = os.path.join(SRC_DIR, "blazespawner.png")
print(f"Base texture: blazespawner.png")

print("\n=== VILLAGER SPAWNER ===")
# Warm brown/tan - classic Minecraft villager coat colors
villager_out = os.path.join(SRC_DIR, "villagerspawner.png")
recolor_spawner(
    base_spawner,
    villager_out,
    target_hue_rgb=(160, 110, 60),  # warm brown
    darken=1.0
)

print("\n=== ENDER DRAGON SPAWNER ===")
# Deep purple void with slight shimmer
dragon_out = os.path.join(SRC_DIR, "enderdragonspawner.png")
recolor_spawner(
    base_spawner,
    dragon_out,
    target_hue_rgb=(100, 20, 160),  # deep purple
    darken=0.9
)

print("\nDone! Unique spawner textures generated.")
