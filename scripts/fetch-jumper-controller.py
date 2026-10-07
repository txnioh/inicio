"""Fetch the unmodified web controller, contracts and ONNX policies, pinned to CAD."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from subprocess import check_output
import hashlib
import json

COMMIT = "61d065219fca767f3142c8f10aff59eae5a5a004"
BASE = f"https://raw.githubusercontent.com/KingKongRobotics/jumper/{COMMIT}/"
DEST = Path(__file__).resolve().parents[1] / "public" / "jumper"


def fetch(source, target, expected=None):
    data = check_output(["curl", "-fsSL", "--retry", "2", BASE + source])
    digest = hashlib.sha256(data).hexdigest()
    if expected and (digest != expected["sha256"] or len(data) != expected["bytes"]):
        raise ValueError(f"Upstream bundle digest mismatch: {source}")
    path = DEST / target
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"file": target, "bytes": len(data), "sha256": digest}


def main():
    bundle_path = "out/bundle_example/jumper/"
    fetch(bundle_path + "bundle.json", "app/bundle.json")
    bundle = json.loads((DEST / "app/bundle.json").read_text())
    paths = {bundle["fsm"], bundle["reference"], "README.md", "manual.en.json"}
    paths.update(bundle["runtimes"]["web"][key] for key in ["glue", "wasm"])
    for mode in bundle["modes"].values():
        paths.update([mode["contract"], mode["models"]["onnx"]])
        if "trajectory" in mode:
            paths.add(mode["trajectory"])
    with ThreadPoolExecutor(max_workers=8) as pool:
        entries = list(pool.map(lambda p: fetch(bundle_path + p, "app/" + p, bundle["files"].get(p)), sorted(paths)))
    entries += [fetch("assets/jumper/motor/motor_config.yaml", "source/motor_config.yaml"),
                fetch("tasks/jumper/common/constants.py", "source/constants.py"),
                fetch("tasks/jumper/common/actuator.py", "source/actuator.py"),
                fetch("rl/mjlab/sim/sim.py", "source/sim.py"),
                fetch("rl/mjlab/tasks/velocity/velocity_env_cfg.py", "source/velocity_env_cfg.py")]
    (DEST / "app/source.json").write_text(json.dumps({"commit": COMMIT, "files": entries}, indent=2) + "\n")
    print(f"Verified {len(entries)} files from Jumper @{COMMIT[:7]}.")


if __name__ == "__main__":
    main()
