"""Build the Marea shell for jumper-design's `assemble`: the original upper
shell plus two antennae and two eyes, in original CAD millimetres, with a
4-colour AMS 3MF whose triangles match the STL exactly.

usage: python marea_shell.py JUMPER_DESIGN_CHECKOUT OUTPUT_DIR
"""
import json, sys, zipfile
from pathlib import Path
import numpy as np
import trimesh
from scipy.spatial.transform import Rotation

root, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
profile = json.loads((root / 'robots/jumper/profile.json').read_text())
tf = profile['cad_mm_to_parent_m']
R, t = np.array(tf['rotation_matrix']), np.array(tf['translation_m'])

# Shell body frame (metres), as in src/app/jumper/marea.ts.
shell = trimesh.load_mesh(root / 'robots/jumper/meshes/visual/upper_shell_link.stl', process=True)
parts = [(shell, 0)]

def segment(a, b, radius):
    a, b = np.array(a), np.array(b)
    rod = trimesh.creation.cylinder(radius=radius, height=np.linalg.norm(b - a), sections=12)
    rod.apply_transform(trimesh.geometry.align_vectors([0, 0, 1], (b - a) / np.linalg.norm(b - a)))
    rod.apply_translation((a + b) / 2)
    return rod

for side in (-1, 1):
    base, end = [0.066, side * 0.014, 0.031], [0.094, side * 0.042, 0.102]
    parts.append((segment(base, end, 0.0022), 1))
    tip = trimesh.creation.icosphere(subdivisions=2, radius=0.0062)
    tip.apply_translation(end)
    parts.append((tip, 2))

# Eyes: discs on the display, from its group transform in marea.ts.
display_in_shell = np.array([0.0802718281911144, 1.01590834547417e-05, 0.0495237801316613]) - np.array([-0.00731370227756162, 0, 0.031499999999999])
group_pos = np.array([-0.001748549, 0.000016063, -0.000652644])
q = np.array([0.674767937, -0.211454873, 0.211535150, 0.674705823])
group_rot = Rotation.from_quat(q / np.linalg.norm(q)).as_matrix()  # scipy: x, y, z, w
for side in (-1, 1):
    disc = trimesh.creation.cylinder(radius=0.0085, height=0.0008, sections=40)
    disc.apply_transform(trimesh.geometry.align_vectors([0, 0, 1], [1, 0, 0]))  # face +X, the display normal
    disc.apply_translation([0.0023, 0, side * 0.022])
    disc.vertices = disc.vertices @ group_rot.T + group_pos + display_in_shell
    parts.append((disc, 3))

meshes, codes = [], []
paint = ['4', '8', '0C', '1C']
for mesh, slot in parts:
    m = mesh.copy()
    m.vertices = ((np.asarray(m.vertices) - t) @ R) / tf['scale']  # metres -> CAD mm (R orthonormal)
    meshes.append(m)
    codes += [paint[slot]] * len(m.faces)
combined = trimesh.util.concatenate(meshes)
stl = out / 'shell.stl'
combined.export(stl)

# Read back exactly as assemble does, then write the matching 3MF.
check = trimesh.load_mesh(stl, process=True)
assert len(check.faces) == len(codes), (len(check.faces), len(codes))
v = np.asarray(check.vertices, dtype=np.float32)
fmt = lambda x: repr(float(x))
obj = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>']
obj += [f'<vertex x="{fmt(a)}" y="{fmt(b)}" z="{fmt(c)}"/>' for a, b, c in v]
obj.append('</vertices><triangles>')
obj += [f'<triangle v1="{a}" v2="{b}" v3="{c}" paint_color="{p}"/>' for (a, b, c), p in zip(check.faces, codes)]
obj.append('</triangles></mesh></object></resources><build><item objectid="1"/></build></model>')
main = ('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
        'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources><object id="2" type="model"><components>'
        '<component p:path="/3D/Objects/object_1.model" objectid="1"/></components></object></resources><build><item objectid="2"/></build></model>')
palette = ['#1F5673', '#16222C', '#FF7A59', '#BFF4F0']
with zipfile.ZipFile(out / 'ams.3mf', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('3D/3dmodel.model', main)
    z.writestr('3D/Objects/object_1.model', ''.join(obj))
    z.writestr('Metadata/project_settings.config', json.dumps({'filament_colour': palette}))
print(json.dumps({'faces': len(codes), 'extent_mm': check.extents.round(1).tolist(), 'palette': palette}))
