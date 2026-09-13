import sys
from PIL import Image

def remove_background(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()

    new_data = []
    # The background is a light gray/white. Let's make everything that is close to white transparent.
    # The image has 3D icons, so they have shadows. We can do a simple floodfill or color distance.
    for item in datas:
        # item is (R, G, B, A)
        # If it's a very light gray (like r>230, g>230, b>230), make it transparent
        if item[0] > 230 and item[1] > 230 and item[2] > 230:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(output_path, "PNG")

if __name__ == "__main__":
    remove_background(sys.argv[1], sys.argv[2])
