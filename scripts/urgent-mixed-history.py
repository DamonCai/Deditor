"""Rebuild/check only the synthetic mixed-document native acceptance fixtures."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--generate', action='store_true', help='create the synthetic files in an empty output directory')
parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[1] / 'tests/artifacts/urgent-closeout-2026-09-22')
parser.add_argument('--md-suffix', default='')
parser.add_argument('--alpha', default='Alpha')
args = parser.parse_args()
directory = args.directory

if args.generate:
    names = ['mixed-history.md', 'mixed-history.baseline.md', 'mixed-history.xmind', 'mixed-history.baseline.xmind']
    if any((directory / name).exists() for name in names):
        parser.error('fixture already exists; choose a fresh --directory to protect saved acceptance results')
    directory.mkdir(parents=True, exist_ok=True)
    sheets = [{'id': 'urgent-mixed-sheet', 'class': 'sheet', 'title': 'Mixed isolation', 'rootTopic': {
        'id': 'urgent-root', 'class': 'topic', 'title': 'Mixed Root', 'structureClass': 'org.xmind.ui.logic.right',
        'children': {'attached': [{'id': 'urgent-alpha', 'class': 'topic', 'title': 'Alpha'},
                                  {'id': 'urgent-beta', 'class': 'topic', 'title': 'Beta'}]}}}]
    entries = {
        'content.json': json.dumps(sheets, ensure_ascii=False).encode(),
        'metadata.json': b'{"creator":{"name":"DEditor generated acceptance"},"activeSheetId":"urgent-mixed-sheet"}',
        'resources/keep.txt': b'synthetic resource must stay byte-identical\n',
    }
    entries['manifest.json'] = json.dumps({'file-entries': {key: {} for key in entries}}).encode()
    for name in ('mixed-history.xmind', 'mixed-history.baseline.xmind'):
        with zipfile.ZipFile(directory / name, 'w', zipfile.ZIP_DEFLATED) as archive:
            for key, value in entries.items():
                archive.writestr(key, value)
    for name in ('mixed-history.md', 'mixed-history.baseline.md'):
        (directory / name).write_bytes(b'# Mixed Markdown\n\nMarkdown stays independent.\n')

expected = (directory / 'mixed-history.baseline.md').read_bytes().replace(
    b'# Mixed Markdown\n', ('# Mixed Markdown' + args.md_suffix + '\n').encode())
actual = (directory / 'mixed-history.md').read_bytes()
assert actual == expected, repr(actual)
with zipfile.ZipFile(directory / 'mixed-history.baseline.xmind') as archive:
    before = {key: archive.read(key) for key in archive.namelist()}
with zipfile.ZipFile(directory / 'mixed-history.xmind') as archive:
    after = {key: archive.read(key) for key in archive.namelist()}
assert before.keys() == after.keys(), (before.keys(), after.keys())
expected_sheets = json.loads(before['content.json'])
expected_sheets[0]['rootTopic']['children']['attached'][0]['title'] = args.alpha
assert json.loads(after['content.json']) == expected_sheets, json.loads(after['content.json'])
for key in before:
    if key != 'content.json':
        assert after[key] == before[key], key
print('PASS exact Markdown; XMind content structure and all other archive entry bytes; alpha=' + args.alpha)
print('Markdown SHA256', hashlib.sha256(actual).hexdigest())
print('Archive SHA256', hashlib.sha256((directory / 'mixed-history.xmind').read_bytes()).hexdigest())
