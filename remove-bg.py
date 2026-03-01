#!/usr/bin/env python3
"""
Remove only the light border edges from dashboard screenshot.
Preserves all internal content including white UI elements.
"""

from PIL import Image
import os

def remove_border_edges_only(input_path, output_path):
    """
    Remove light borders from edges only, preserving internal content.
    """
    try:
        # Open image and convert to RGBA
        img = Image.open(input_path).convert('RGBA')
        pixels = img.load()
        width, height = img.size
        
        # Find the topmost non-light row
        top = 0
        for y in range(height):
            is_light_row = True
            for x in range(width):
                r, g, b, a = pixels[x, y]
                # If we find a darker pixel, this is the content start
                if not (r > 200 and g > 200 and b > 200):
                    is_light_row = False
                    break
            if not is_light_row:
                top = y
                break
        
        # Find the bottommost non-light row
        bottom = height - 1
        for y in range(height - 1, -1, -1):
            is_light_row = True
            for x in range(width):
                r, g, b, a = pixels[x, y]
                if not (r > 200 and g > 200 and b > 200):
                    is_light_row = False
                    break
            if not is_light_row:
                bottom = y + 1
                break
        
        # Find the leftmost non-light column
        left = 0
        for x in range(width):
            is_light_col = True
            for y in range(height):
                r, g, b, a = pixels[x, y]
                if not (r > 200 and g > 200 and b > 200):
                    is_light_col = False
                    break
            if not is_light_col:
                left = x
                break
        
        # Find the rightmost non-light column
        right = width - 1
        for x in range(width - 1, -1, -1):
            is_light_col = True
            for y in range(height):
                r, g, b, a = pixels[x, y]
                if not (r > 200 and g > 200 and b > 200):
                    is_light_col = False
                    break
            if not is_light_col:
                right = x + 1
                break
        
        # Crop to the content area
        img_cropped = img.crop((left, top, right, bottom))
        
        # Save
        img_cropped.save(output_path, 'PNG')
        print(f"✅ Borders removed! Saved to: {output_path}")
        print(f"   Original size: {img.size}")
        print(f"   New size: {img_cropped.size}")
        print(f"   Removed: top={top}px, bottom={height-bottom}px, left={left}px, right={width-right}px")
        
    except FileNotFoundError:
        print(f"❌ Error: File not found at {input_path}")
        print(f"   Make sure dashboard-screenshot.png is in /frontend/public/")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    input_file = "/Users/macplus/Documents/dev/benela-ai/frontend/public/dashboard-screenshot.png"
    output_file = "/Users/macplus/Documents/dev/benela-ai/frontend/public/dashboard-screenshot.png"
    
    print("Removing border edges from dashboard screenshot (preserving all content)...")
    remove_border_edges_only(input_file, output_file)
