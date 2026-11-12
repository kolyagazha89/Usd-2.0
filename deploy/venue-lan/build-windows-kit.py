"""Reproducible, allowlisted distribution. Never traverse a live operator folder."""
from pathlib import Path
from io import BytesIO
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent.parent / "frontend/public/downloads"
FILES = (
    "USD-Install.cmd", "USD-Offline.cmd", "USD-Online.cmd",
    "venue-control.ps1", "venue-dialogs.ps1", "venue-firewall.ps1",
    "compose.yaml", "Caddyfile", "config/venue-config.js",
    "initdb/010-venue-api-role.sh", "INSTRUCTION.html",
    "import-stage.mjs", "verify-stage-package.mjs", "make-demo-stage.mjs",
    "provision-rustfs.mjs", "provision-staff.mjs", "install-journal.sql",
    "export-venue-return.mjs", "venue-return-package.mjs", "verify-venue-return.mjs",
    "preview-venue-reconciliation.mjs", "preview-venue-reconciliation-cli.mjs",
)

def build():
    stream = BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in FILES:
            item = zipfile.ZipInfo("USD-Offline-Windows/" + name, (2026, 11, 12, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o100644 << 16
            archive.writestr(item, (ROOT / name).read_bytes(), compresslevel=9)
    kit = stream.getvalue()
    return {
        "USD-Offline-Windows.zip": kit,
        "USD-Offline-Guide.html": (ROOT / "INSTRUCTION.html").read_bytes(),
        "USD-Offline-Windows.json": (json.dumps({
            "format": 1, "filename": "USD-Offline-Windows.zip", "bytes": len(kit),
            "sha256": hashlib.sha256(kit).hexdigest(),
        }, indent=2) + "\n").encode(),
    }

if __name__ == "__main__":
    files = build()
    if "--check" in sys.argv:
        stale = [name for name, data in files.items() if not (OUTPUT / name).is_file() or (OUTPUT / name).read_bytes() != data]
        if stale:
            raise SystemExit("Windows download kit is stale; run python3 deploy/venue-lan/build-windows-kit.py: " + ", ".join(stale))
    else:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (OUTPUT / name).write_bytes(data)
    print("Windows download kit verified (allowlist only; no secrets or participant data)")
