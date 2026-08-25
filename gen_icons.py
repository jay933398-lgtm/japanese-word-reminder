from PIL import Image, ImageDraw, ImageFont

def make_icon(size, path):
    img = Image.new("RGBA", (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    pad = int(size*0.06)
    d.rounded_rectangle([pad, pad, size-pad, size-pad], radius=int(size*0.22), fill=(192,57,43,255))
    font_size = int(size*0.56)
    font = ImageFont.truetype("C:\Windows\Fonts\YuGothB.ttc", font_size)
    text = "日"
    bbox = d.textbbox((0,0), text, font=font)
    w = bbox[2]-bbox[0]
    h = bbox[3]-bbox[1]
    x = (size - w)/2 - bbox[0]
    y = (size - h)/2 - bbox[1]
    d.text((x, y), text, font=font, fill=(255,255,255,255))
    img.save(path)

make_icon(192, "icons/icon-192.png")
make_icon(512, "icons/icon-512.png")
print("done")
