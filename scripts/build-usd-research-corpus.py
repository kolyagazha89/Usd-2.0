"""Build a read-only corpus from Git-tracked release source, not server data.

Run at checkout before building the immutable backend image. No credentials,
.env files, databases, private directories, archives, or untracked files.
"""
from pathlib import Path, PurePosixPath
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PREFIXES = ("docs/", "backend/src/", "frontend/src/", "deploy/venue-lan/", "deploy/home-pc/")
EXT = {".md", ".ts", ".tsx", ".css", ".prisma", ".mjs", ".ps1", ".sh", ".yaml", ".yml", ".html", ".js"}
LIMIT = 300_000
MAX_CORPUS = 23_000_000

def allowed(name):
    path = PurePosixPath(name)
    return (name == "backend/prisma/schema.prisma" or name.startswith(PREFIXES)) and (
        path.suffix in EXT and not any(
            p.startswith(".") or p.lower() in {"local-private", "secrets", "node_modules", "dist", "coverage"}
            for p in path.parts
        )
    ) and not name.endswith((".spec.ts", ".test.ts", "usd-documents.snapshot.ts"))

def build():
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    names = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", "-z", revision], cwd=ROOT).decode("utf-8").split("\0")
    files = []
    for name in sorted(filter(allowed, names)):
        # Read the exact tracked Git blob, not a modified checkout or symlink target.
        data = subprocess.check_output(["git", "show", f"{revision}:{name}"], cwd=ROOT)
        if len(data) > LIMIT:
            continue
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            continue
        text = re.sub(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----", "[private key removed]", text)
        files.append({"path": name, "text": text})
    payload = json.dumps({"revision": revision, "files": files}, ensure_ascii=False, separators=(",", ":"))
    if not files or len(payload.encode("utf-8")) > MAX_CORPUS:
        raise SystemExit("USD research corpus empty or too large; review the bounded source scope")
    (ROOT / "backend/usd-research-corpus.json").write_text(payload, encoding="utf-8")
    print(f"USD research index: {len(files)} tracked source files, revision {revision}")

if __name__ == "__main__":
    build()
