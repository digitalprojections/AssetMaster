"""Create disposable red/green/blue frames for manual cleanup navigation checks."""
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw

frames = []
for index, color in enumerate(['#ef4444', '#22c55e', '#3b82f6']):
    image = Image.new('RGBA', (96, 96), 'white')
    ImageDraw.Draw(image).rectangle((24, 24, 72, 72), fill=color)
    output = io.BytesIO()
    image.save(output, format='PNG')
    frames.append(dict(
        id=f'cleanup-nav-{index}', name=f'Navigation test {index + 1}',
        path=[], type='rectangle', bounds=dict(x=0, y=0, width=96, height=96),
        feather=0, thumbnailUrl='data:image/png;base64,' + base64.b64encode(output.getvalue()).decode(),
        createdAt=index + 1, collectionId='cleanup-nav-test', collectionName='Navigation test',
        collectionIndex=index + 1, collectionCount=3,
    ))

directory = Path(__file__).resolve().parent.parent / '.browser-test'
directory.mkdir(exist_ok=True)
target = directory / 'cleanup-navigation.json'
target.write_text(json.dumps(dict(version=1, exportedAt=1, lastCutoutIndex=3, savedSegments=frames)))
print(target)
