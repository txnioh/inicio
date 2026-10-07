"""Fetch the original Jumper CAD model and its licence at a pinned revision."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from subprocess import check_output
import hashlib
import json
import xml.etree.ElementTree as ET

COMMIT = "61d065219fca767f3142c8f10aff59eae5a5a004"
BASE = f"https://raw.githubusercontent.com/KingKongRobotics/jumper/{COMMIT}/"
DEST = Path(__file__).resolve().parents[1] / "public" / "jumper"


def fetch(source, target):
    data = check_output(["curl", "--fail", "--silent", "--show-error", "--retry", "2", BASE + source])
    path = DEST / target
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"file": target, "sha256": hashlib.sha256(data).hexdigest()}


def main():
    model = fetch("assets/jumper/jumper.xml", "jumper.xml")
    meshes = [mesh.attrib["file"] for mesh in ET.parse(DEST / "jumper.xml").findall("asset/mesh")]
    files = [(f"assets/jumper/{p}", p) for p in meshes]
    files += [("LICENSE", "LICENSE"), ("NOTICE", "NOTICE")]
    with ThreadPoolExecutor(max_workers=8) as pool:
        entries = list(pool.map(lambda args: fetch(*args), files))
    manifest = {"repository": "https://github.com/KingKongRobotics/jumper", "commit": COMMIT,
                "meshes": meshes, "files": [model, *entries]}
    (DEST / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Fetched {len(entries) + 1} files from Jumper @ {COMMIT[:7]}.")


if __name__ == "__main__":
    main()
