"""Read only dedicated synthetic capture artifacts; never print native build/auth logs."""
import base64
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
for name in ['ui-source-commit.txt', 'source-commit.txt', 'xcode.txt']:
    path = root / name
    if path.exists():
        print('CAPTURE_PROVENANCE ' + json.dumps({'path': name, 'value': path.read_text().strip()}))
for path in sorted(root.glob('*/device.txt')):
    print('CAPTURE_PROVENANCE ' + json.dumps({'path': str(path.relative_to(root)), 'value': path.read_text().strip()}))
for path in sorted(root.rglob('test.log')):
    print('CAPTURE_TEST_LOG', str(path.relative_to(root)))
    lines = path.read_text(errors='replace').splitlines()
    for line in lines[-110:]:
        print(line)
for path in sorted(root.rglob('attachments/manifest.json')):
    print('CAPTURE_ATTACHMENT_MANIFEST', str(path.relative_to(root)))
    print(path.read_text())
# Opaque base64 chunks transfer approved, synthetic app images via read-only Actions logs.
# No source mutation or credential/write permission is needed for this transfer.
for path in sorted(root.glob('*/attachments/*.png')):
    raw = path.read_bytes()
    name = str(path.relative_to(root))
    digest = hashlib.sha256(raw).hexdigest()
    print('CAPTURE_PNG_BEGIN ' + json.dumps({'path': name, 'sha256': digest, 'bytes': len(raw)}))
    data = base64.b64encode(raw).decode('ascii')
    for start in range(0, len(data), 12000):
        print('CAPTURE_PNG_DATA ' + data[start:start + 12000])
    print('CAPTURE_PNG_END ' + digest)
