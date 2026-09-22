"""Create or byte-check synthetic files for native Finder/window acceptance."""
import argparse
import hashlib
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[1] / 'tests/artifacts/native-desktop-2026-09-22')
parser.add_argument('--generate', action='store_true')
parser.add_argument('--a-suffix', default='')
parser.add_argument('--one-suffix', default='')
parser.add_argument('--two-suffix', default='')
args = parser.parse_args()
fixtures = [
    ('window-owner-a.md', '# Window A', 'Owner A marker: A-20260922.', args.a_suffix),
    ('Finder drop folder/finder-one.md', '# Finder One', 'Drag marker: F1-20260922.', args.one_suffix),
    ('Finder drop folder/finder-two.md', '# Finder Two', 'Drag marker: F2-20260922.', args.two_suffix),
]
if args.generate and any((args.directory / name).exists() for name, *_ in fixtures):
    parser.error('fixture already exists; choose a fresh --directory to preserve acceptance results')
for name, title, body, suffix in fixtures:
    path = args.directory / name
    if args.generate:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(f'{title}\n\n{body}\n'.encode())
    expected = f'{title}{suffix}\n\n{body}\n'.encode()
    actual = path.read_bytes()
    assert actual == expected, (str(path), actual)
    print('PASS', path, hashlib.sha256(actual).hexdigest())
