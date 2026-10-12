"""Assemble the whole Marea robot with jumper-design's own `assemble`.

usage: python marea_assemble.py JUMPER_DESIGN_CHECKOUT SHELL_DIR OUTPUT_DIR
"""
import json, re, sys
import xml.etree.ElementTree as ET
from pathlib import Path

root, shell_dir, output = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path.insert(0, str(root / 'src'))
from shellflow.simulation import assemble

# The colours of src/app/jumper/marea.ts, per baseline visual geom.
rgba = lambda hex_: [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)] + [1.0]
def colour(link):
    if re.search(r'base_link|display_module|camera_link|tof_sensor|grip_insert|thigh_link', link): return '#16222c'
    if re.search(r'foot_tip|palm_pad|finger_tip', link): return '#ff7a59'
    if re.search(r'hip_link|upper_arm', link): return '#cfe3dc'
    return '#1f5673'
xml = ET.parse(root / 'robots/jumper/baseline.xml').getroot()
overrides = []
for body in xml.iter('body'):
    link = body.get('name')
    if link == 'upper_shell_link': continue
    for geom in body.findall('geom'):
        if geom.get('name', '').endswith('_visual'):
            overrides.append({'link': link, 'geom': geom.get('name'), 'rgba': rgba(colour(link))})
report = assemble(shell_dir / 'shell.stl', output, root / 'robots/jumper/profile.json', ams3mf=shell_dir / 'ams.3mf', visual_overrides=overrides)
print(json.dumps({k: report.get(k) for k in ('passed', 'color_report', 'seam_check') if k in report}, indent=1)[:2000])
