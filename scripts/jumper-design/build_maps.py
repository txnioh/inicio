"""Package the downhill runs as jumper-design `.map` files (kk-scene-package/2).

Input: the JSON written by export-runs.mjs (the site's own physics XML, spawn
and drawing). Each run becomes a /1 environment (scene.xml, OBJ meshes,
visual-appearance.json), which jumper-design's `export_environment` upgrades to
/2 with the given `.skin` as its default robot, validates and composes.

usage: python build_maps.py JUMPER_DESIGN RUNS_DIR SKIN OUTPUT_DIR
"""
import base64, io, json, sys
import xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np

root, runs, skin, out = map(Path, sys.argv[1:5])
sys.path.insert(0, str(root / 'src'))
from shellflow.map_package import export_environment, compose_default
from shellflow.package_io import read_archive
from shellflow.packages import verify_package
from shellflow.web_appearance import appearance_document

PROFILE = root / 'robots/jumper/profile.json'
TERRAIN_FACES, TERRAIN_COLOURS = 600_000, 14  # no simplification at today's size: it blurs the ground beside the road
RUNS = {
    'calle': dict(id='jumper-street-run', title='Jumper Street Run', description='A 50 m downhill street with cones, an island, a slalom and a bollard chicane. Jumper starts on the platform beside a waiting skateboard: step right (D) onto the deck and the board rolls over the edge. Steer by leaning (roll).'),
    'costa': dict(id='jumper-coast-road', title='Jumper Coast Road', view=(90, -55, 70, 20), description='A winding coast road above the sea. Jumper starts on the platform beside a waiting longboard: step right (D) onto the deck and the board rolls over the edge. Steer by leaning (roll) through the bends.'),
}
# Colours for the free bodies, which the site draws itself (board, cones).
BODY_COLOURS = {'skate_deck': '#2b2b2e', 'skate_kick': '#2b2b2e', 'skate_front_base': '#b9bec3', 'skate_back_base': '#b9bec3',
                'hanger': '#b9bec3', 'wheel': '#e9b44c', 'skate_cone': '#e8622c'}

def decode(text, dtype):
    return np.frombuffer(base64.b64decode(text), dtype=dtype)

def srgb_to_hex(rgb):
    return '#' + ''.join(f'{round(min(1, max(0, v)) * 255):02x}' for v in rgb)

def hex_rgba(hex_, alpha=1.0):
    return ' '.join(f'{int(hex_[i:i + 2], 16) / 255:.4f}' for i in (1, 3, 5)) + f' {alpha:g}'

def obj_bytes(vertices, faces):
    out = io.StringIO()
    np.savetxt(out, vertices, fmt='v %.4f %.4f %.4f')
    np.savetxt(out, faces + 1, fmt='f %d %d %d')
    return out.getvalue().encode()

def clean(vertices, faces):
    """Drop unused vertices and degenerate triangles."""
    faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
    used, inverse = np.unique(faces, return_inverse=True)
    return vertices[used], inverse.reshape(-1, 3)

def terrain_groups(parts):
    """Merge the shaded ground, simplify it, and split it into flat colours."""
    import fast_simplification
    from scipy.spatial import cKDTree
    from scipy.cluster.vq import kmeans2
    verts, faces, colours, offset = [], [], [], 0
    for part in parts:
        v = decode(part['positions'], np.float32).reshape(-1, 3)
        verts.append(v); colours.append(decode(part['colours'], np.float32).reshape(-1, 3))
        faces.append(decode(part['indices'], np.uint32).reshape(-1, 3).astype(np.int64) + offset); offset += len(v)
    v, f, c = np.vstack(verts).astype(np.float64), np.vstack(faces), np.vstack(colours)
    if len(f) > TERRAIN_FACES:
        sv, sf = fast_simplification.simplify(v, f, target_reduction=1 - TERRAIN_FACES / len(f))
        c = c[cKDTree(v).query(sv)[1]]
        v, f = sv, sf
    face_colour = c[f].mean(axis=1)
    rng = np.random.default_rng(7)
    centres, labels = kmeans2(face_colour, TERRAIN_COLOURS, seed=rng, minit='++')
    for k, centre in enumerate(centres):
        chosen = f[labels == k]
        if len(chosen):
            yield srgb_to_hex(centre), *clean(v, chosen)

def build(name, run):
    meta = RUNS[name]
    files, materials, visuals = {}, {}, []
    # Static drawing, grouped by material.
    groups = {}
    for part in run['parts']:
        if part['material']['terrain']:
            continue
        m = part['material']
        key = (m['color'], round(m['roughness'], 2), round(m['metalness'], 2), m['emissive'], round(m['emissiveIntensity'], 2), round(m['opacity'], 2), m['unlit'], m['double'])
        v = decode(part['positions'], np.float32).reshape(-1, 3).astype(np.float64)
        groups.setdefault(key, []).append((v, decode(part['indices'], np.uint32).reshape(-1, 3).astype(np.int64)))
    def add_material(mid, colour, roughness=0.9, metalness=0.0, emissive='#000000', intensity=0.0, opacity=1.0, unlit=False, double=False):
        materials[mid] = dict(color=colour, opacity=opacity, roughness=roughness, metalness=metalness, emissive=emissive,
                              emissiveIntensity=intensity, unlit=unlit, side='double' if double else 'front', flatShading=False)
    for index, (key, items) in enumerate(groups.items()):
        colour, roughness, metalness, emissive, intensity, opacity, unlit, double = key
        verts, faces, offset = [], [], 0
        for v, f in items:
            verts.append(v); faces.append(f + offset); offset += len(v)
        v, f = clean(np.vstack(verts), np.vstack(faces))
        mid = f'{name}_m{index}'
        add_material(mid, colour, roughness, metalness, emissive, intensity, opacity, unlit, double)
        visuals.append((mid, v, f))
    terrain = [p for p in run['parts'] if p['material']['terrain']]
    if terrain:
        for k, (colour, v, f) in enumerate(terrain_groups(terrain)):
            mid = f'{name}_ground{k}'
            add_material(mid, colour, roughness=1.0)
            visuals.append((mid, v, f))

    # scene.xml: the site's MJCF; static colliders hidden (the drawing shows them).
    world = ET.fromstring(f'<worldbody>{run["world"]}</worldbody>')
    asset = ET.fromstring(f'<asset>{run["asset"]}</asset>')
    for geom in world.findall('geom'):
        if geom.get('name') == 'dropin_platform':
            continue  # the start platform is drawn by its own box
        geom.set('rgba', '0 0 0 0'); geom.set('group', '3')
    mid = f'{name}_platform'
    asset.append(ET.Element('material', name=mid, rgba=hex_rgba('#d9d6cf'), roughness='0.9', metallic='0'))
    add_material(mid, '#d9d6cf')
    world.find("geom[@name='dropin_platform']").set('material', mid)
    props = []
    for body in world.findall('body'):
        bname = body.get('name')
        free = body.find('freejoint')
        if free is not None and not free.get('name'):
            free.set('name', bname)
        props.append(dict(name=bname, body=bname, freeJoint=True, freeJointName=free.get('name'), position=list(map(float, body.get('pos').split()))))
        for geom in body.iter('geom'):
            gname = geom.get('name', '')
            colour = next((c for k, c in BODY_COLOURS.items() if k in gname), '#8f9399')
            mid = f'{name}_{"cone" if "cone" in gname else gname.replace("skate_", "board_")}'
            if mid not in materials:
                asset.append(ET.Element('material', name=mid, rgba=hex_rgba(colour), roughness='0.6', metallic='0'))
                add_material(mid, colour, roughness=0.6)
            geom.set('material', mid)
    for mid, v, f in visuals:
        path = f'assets/{mid}.obj'
        files[path] = obj_bytes(v, f)
        m = materials[mid]
        asset.append(ET.Element('mesh', name=mid, file=path, inertia='shell'))
        asset.append(ET.Element('material', name=mid, rgba=hex_rgba(m['color'], m['opacity']), roughness=f'{m["roughness"]:g}', metallic=f'{m["metalness"]:g}'))
        world.append(ET.Element('geom', name=f'visual_{mid}', type='mesh', mesh=mid, material=mid, contype='0', conaffinity='0', mass='0'))
    world.insert(0, ET.Element('light', name='sun', pos='0 0 30', dir='-0.4 0.3 -1', directional='true', diffuse='0.6 0.6 0.6', castshadow='true'))
    scene = ET.Element('mujoco', model=meta['id'])
    ET.SubElement(scene, 'compiler', angle='radian')
    scene.append(asset); scene.append(world)
    ET.indent(scene)
    files['scene.xml'] = ET.tostring(scene, encoding='utf-8', xml_declaration=True) + b'\n'
    appearance = appearance_document({})
    appearance['materials'] = materials
    files['visual-appearance.json'] = (json.dumps(appearance, indent=2) + '\n').encode()
    files['README.md'] = (f'# {meta["title"]}\n\n{meta["description"]}\n\nExported from the site\'s own simulation (physics, board and spawn) by '
                          'scripts/jumper-design in github.com/txnioh/inicio. The road, curbs, cones and board collide; the scenery is display-only, '
                          'with a flat floor below.\n\nDrop-in: Jumper starts on a fixed platform beside the board, which waits on the level top '
                          'of the run with a chock behind its back wheels. Step right (D) until Jumper is centred on the deck; its weight '
                          'tips the board over the edge. The deck is 60 cm wide (44-46 cm on the site, where a rider script keeps Jumper '
                          'centred). Tested in the site\'s simulator with the original controller and policies: the board waits unloaded, '
                          'starts once Jumper is on, and rides about 6-8 m before the first cone or bend, which need steering.\n').encode()

    from shellflow.package_io import file_records
    manifest = {
        'schema': 'kk-scene-package/1', 'id': meta['id'], 'title': meta['title'], 'description': meta['description'],
        'version': '1.0.0', 'use': 'watching',
        'exportedBy': {'repo': 'txnioh/inicio', 'tool': 'scripts/jumper-design/build_maps.py'},
        'source': {'repository': 'https://github.com/txnioh/inicio', 'authoredGround': True},
        'requiredCapabilities': ['rigid'],
        'world': {'file': 'scene.xml', 'assetDir': '', 'terrainType': 'mesh', 'ground': {'geom': 'playground_floor'},
                  'counts': {'geoms': sum(1 for _ in world.iter('geom')), 'bodies': sum(1 for _ in world.iter('body')), 'lights': 1,
                             'textures': 0, 'materials': len(asset.findall('material')), 'meshes': len(asset.findall('mesh'))},
                  'attach': {'prefix': 'scn_'}},
        'props': props, 'flex': [], 'lights': [{'name': 'sun'}], 'cameras': [],
        'spawn': {'position': run['spawn']['position'], 'yaw': run['spawn']['yaw']},
    }
    manifest['files'] = file_records({n: b for n, b in files.items() if n != 'README.md'})
    files['scene-package.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    return meta, files

def thumbnail(files, spawn, path, view=(0, -22, 6, 4)):
    """The environment from behind the start, without the robot."""
    import mujoco
    from PIL import Image
    assets = {n: b for n, b in files.items() if n.endswith('.obj')}
    model = mujoco.MjModel.from_xml_string(files['scene.xml'].decode(), assets=assets)
    data = mujoco.MjData(model); mujoco.mj_forward(model, data)
    model.vis.global_.offwidth, model.vis.global_.offheight = 1000, 750
    model.vis.headlight.ambient[:] = [.25, .25, .25]; model.vis.headlight.diffuse[:] = [.3, .3, .3]; model.vis.headlight.specular[:] = 0
    # From above and behind the start, looking down the run.
    turn, elevation, distance, ahead = view
    yaw = np.radians(spawn['yaw'])
    camera = mujoco.MjvCamera()
    camera.lookat[:] = np.array(spawn['position']) + [ahead * np.cos(yaw), ahead * np.sin(yaw), -0.5]
    camera.azimuth, camera.elevation, camera.distance = spawn['yaw'] + turn, elevation, distance
    with mujoco.Renderer(model, height=750, width=1000) as renderer:
        renderer.update_scene(data, camera)
        Image.fromarray(renderer.render()).save(path)

out.mkdir(parents=True, exist_ok=True)
for name in RUNS:
    run = json.loads((runs / f'{name}.json').read_text())
    meta, files = build(name, run)
    preview = out / f'{meta["id"]}.png'
    thumbnail(files, run['spawn'], preview, **({'view': meta['view']} if 'view' in meta else {}))
    target = out / f'{meta["id"]}.map'
    if target.exists():
        target.unlink()
    result = export_environment(files, target, skin, PROFILE, preview=preview)
    report = verify_package(target, platform_profile=PROFILE, mujoco=True)
    _, _, composition = compose_default(read_archive(target), profile=PROFILE)
    print(json.dumps({'map': target.name, 'bytes': target.stat().st_size, 'sha256': result['sha256'],
                      'verified': report.get('ok', report.get('valid')), 'spawn': composition.get('spawn_support'),
                      'spawn_applied': composition.get('spawn_applied')}, default=str))
