import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, dst = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
mode = sys.argv[3] if len(sys.argv) > 3 else "magenta"
if mode == "green":   # a flat #00FF00 sky: green-ness is high in the sky, near 0 in warm rock
    m = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
else:                 # magenta-ness: high in the sky, near 0 in rock, snow, forest
    m = (a[..., 0] + a[..., 2]) / 2 - a[..., 1]
strong = m > 110
sky = a[strong].mean(axis=0) if strong.any() else np.array([220, 60, 210], np.float32)
t = np.clip((m - 22.0) / 38.0, 0, 1)
t = ndi.gaussian_filter(t, 0.7)
alpha = 1.0 - t
al = np.maximum(alpha, 0.04)[..., None]
rgb = (a - t[..., None] * sky) / al
# despill: a fringe pixel may keep a pink cast, pull red/blue down to the green channel
spill = np.clip((rgb[..., 0] + rgb[..., 2]) / 2 - rgb[..., 1], 0, None)
rgb[..., 0] -= spill * 0.6
rgb[..., 2] -= spill * 0.6
rgb = np.clip(rgb, 0, 255)
# the un-mixed colour of a soft edge pixel is noisy (cyan fringes): take the colour of the nearest solid pixel instead
alpha = ndi.grey_erosion(alpha, size=(3, 3))
solid = alpha > 0.97
idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
soft = alpha < 0.97
rgb[soft] = rgb[idx[0][soft], idx[1][soft]]
alpha = np.where(alpha < 0.04, 0, alpha)
Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA").save(dst)
print("saved", dst)
