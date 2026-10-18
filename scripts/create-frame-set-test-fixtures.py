"""Create disposable image/video fixtures for Animation Studio browser tests."""
import argparse
from pathlib import Path
import shutil
import struct
import subprocess
import zlib


def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('.browser-test/frame-sets'))
    parser.add_argument('--video-seconds', type=float, default=12, help='Duration for range-selection checks (default: 12).')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for index, color in enumerate([(220, 60, 60), (60, 180, 80), (60, 100, 220)], 1):
        rows = b''.join(b'\0' + bytes((*color, 255)) * 64 for _ in range(64))
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 64, 64, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
        (args.output / f'fixture_{index:03}.png').write_bytes(png)
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('Images created. Install FFmpeg to create the video fixture.')
    if not 0 < args.video_seconds <= 601:
        parser.error('--video-seconds must be between 0 and 601 seconds')
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=size=64x64:rate=12:duration={args.video_seconds}', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(args.output / 'disposable_video.mp4')], check=True)
    print(args.output.resolve())


if __name__ == '__main__':
    main()
