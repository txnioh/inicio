"""Resolve the pinned training constants without installing the GPU trainer."""
import ast
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / "public" / "jumper"
tree = ast.parse((ROOT / "source/constants.py").read_text())
constants = {}
for node in tree.body:
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        try:
            constants[node.target.id] = ast.literal_eval(node.value)
        except ValueError:
            pass
    elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
        try:
            constants[node.targets[0].id] = ast.literal_eval(node.value)
        except ValueError:
            pass

feet = [name + "_meshcol" for name in constants["FEET"]]
names = feet + [name + "_meshcol" for name in constants["CHASSIS_LINKS"] + constants["LIMB_LINKS"] + constants["TIP_LINKS"]]
legs = constants["LEGS"]
collisions = {}
for name in names:
    leg = next((i for i, leg in enumerate(legs) if name.startswith(leg + "_")), None)
    collisions[name] = {
        "contype": 1 if leg is None else 1 | (1 << (leg + 1)),
        "conaffinity": 0 if leg is None else 126 & ~(1 << (leg + 1)),
        "condim": 3 if name in feet else 1,
        "priority": 1 if name in feet else 0,
        "friction": constants["_FOOT_FRICTION"] if name in feet else [1, 0.01, 0.01],
        "solref": constants["_CONTACT_SOLREF"],
        "solimp": constants["_CONTACT_SOLIMP"],
    }

# MuJoCo options: the actual dataclass defaults, with the velocity environment's
# explicit overrides, just as export_web_robot.py obtains them.
sim_tree = ast.parse((ROOT / "source/sim.py").read_text())
cfg = next(node for node in sim_tree.body if isinstance(node, ast.ClassDef) and node.name == "MujocoCfg")
options = {node.target.id: ast.literal_eval(node.value) for node in cfg.body if isinstance(node, ast.AnnAssign)}
env_tree = ast.parse((ROOT / "source/velocity_env_cfg.py").read_text())
call = next(node for node in ast.walk(env_tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "MujocoCfg")
options.update({kw.arg: ast.literal_eval(kw.value) for kw in call.keywords})
options.pop("disableflags"); options.pop("enableflags")
options["solver"] = {"newton": "Newton", "cg": "CG", "pgs": "PGS"}[options["solver"]]

# Read the first servo's measured spec, refusing missing/null numbers.
block = (ROOT / "source/motor_config.yaml").read_text().split("  joint_servo_100:")[0]
def number(key):
    match = re.search(r"^\s+" + key + r":\s*([0-9.]+)\s", block, re.M)
    if not match:
        raise ValueError(f"Missing measured servo parameter: {key}")
    return float(match[1])
curve = {key: number(key) for key in ["plateau_torque_nm", "corner_speed_rpm", "decay_speed_rpm", "cutoff_speed_rpm", "thermal_continuous_torque_nm", "peak_duration_s"]}
curve["thermal_time_constant_s"] = curve["peak_duration_s"] / math.log(1 / (1 - (curve["thermal_continuous_torque_nm"] / curve["plateau_torque_nm"]) ** 2))
config = {"source": "KingKongRobotics/jumper@61d065219fca767f3142c8f10aff59eae5a5a004", "options": options, "collisions": collisions, "feet": feet, "standHeight": constants["STAND_Z"], "home": constants["HOME"], "servo": curve}
(ROOT / "physics.json").write_text(json.dumps(config, indent=2) + "\n")
print(f"Resolved {len(collisions)} collision geoms and measured servo curve from pinned source.")
