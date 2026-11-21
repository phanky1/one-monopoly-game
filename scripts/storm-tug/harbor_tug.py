"""Build the storm response tug, its animated winch, and the transparent board poster.

From the repository root, run with Blender 4.3.2:
    blender -b -t 4 -P scripts/storm-tug/harbor_tug.py

The origin is at the keel, the bow points along +X, and the tow leaves the aft roller.
"""

from math import cos, sin, tau
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "scripts" / "token-models"))
from build import join_parts, poster
from idle import key_motion
from studio import beam, box, cylinder, mesh, moving_part, paint
from vessels import loft

DEST = ROOT / "packages" / "client" / "public" / "models" / "storm"
NAVY = '#172F46'
RUBBER = '#32383D'
MAGENTA = '#CC1D70'
IVORY = '#F4EADA'
DECK = '#959F9A'
GLASS = '#256073'
ORANGE = '#F47636'
ROPE = '#DAB982'


def tire(name, center, radius, tube, color, markings=False):
    """An open rubber ring standing against the hull, optionally with four lashings."""
    x, y, z = center
    segments, sides = 16, 6
    verts, faces = [], []
    for i in range(segments):
        a = tau * i / segments
        for j in range(sides):
            b = tau * j / sides
            ring = radius + tube * cos(b)
            verts.append((x + ring * cos(a), y + tube * sin(b), z + ring * sin(a)))
            following = ((i + 1) % segments) * sides
            faces.append((i * sides + j, following + j,
                          following + (j + 1) % sides, i * sides + (j + 1) % sides))
    obj = mesh(name, verts, faces, color, bevel=0)
    if markings:
        obj.data.materials.append(paint(IVORY))
    for face in obj.data.polygons:
        face.use_smooth = True
        if markings and (face.index // sides) % 4 == 0:
            face.material_index = 1


def hull():
    # Rounded stern, beamy midships and rising sheer at the blunt working bow.
    stations = [(-1.44, .20, .51), (-1.38, .46, .51), (-1.20, .60, .50),
                (-.85, .67, .48), (-.25, .69, .48), (.43, .67, .50),
                (.84, .60, .54), (1.12, .49, .58), (1.36, .29, .62), (1.45, .14, .63)]
    outline = [(x, -y, h) for x, y, h in stations] + list(reversed(stations))

    def ring(length, width, height):
        return [(x * length, y * width, h * height) for x, y, h in outline]

    keel = ring(.90, .63, .018)
    waterline = ring(.96, .86, .23)
    sheer = ring(.985, .964, .58)
    band = ring(.997, .995, .80)
    lip = ring(1, 1, .96)
    loft('Antifouling bottom', keel, waterline, '#904153', bevel=.009)
    loft('Deep navy hull', waterline, sheer, NAVY, bevel=0)
    loft('Magenta sheer stripe', sheer, band, MAGENTA, bevel=0)
    loft('Raised bulwarks', band, lip, NAVY, bevel=0)
    loft('Weather deck', lip, ring(.997, .983, 1), DECK, bevel=.006)

    # Short doubler around the bow supports a thick rubber push pad.
    front = [(x, -y, h) for x, y, h in stations[6:]] + list(reversed(stations[6:]))
    for i in range(len(front) - 1):
        x1, y1, h1 = front[i]
        x2, y2, h2 = front[i + 1]
        outer = [(x1 * 1.012, y1 * 1.03, h1 - .13), (x2 * 1.012, y2 * 1.03, h2 - .13),
                 (x2 * 1.018, y2 * 1.045, h2 + .005), (x1 * 1.018, y1 * 1.045, h1 + .005)]
        inner = [(x * .975, y * .96, z) for x, y, z in outer]
        loft('Bow pushing rubber', inner, outer, RUBBER, bevel=.006)

    for side in (-1, 1):
        for x, y, height in [(1.12, .49, .58), (1.23, .398, .60),
                             (1.35, .30, .62), (1.43, .18, .63)]:
            cylinder('Bow fender rib', (x * 1.014, side * y * 1.036, height - .067),
                     .034, .147, '#475158', vertices=8, bevel=0)
        for x, girth in [(-1.04, .648), (-.53, .684), (.01, .69), (.54, .65)]:
            tire('Suspended tire fender', (x, side * (girth + .018), .327), .119, .044, RUBBER)
            for dx in (-.063, .063):
                beam('Fender lashing', (x + dx, side * girth, .484),
                     (x + dx, side * (girth + .035), .421), .021, ROPE)


def bridge_ring(aft, fore, width, z):
    """Chamfer all four corners to give the master visibility around a tow."""
    return [(aft, -width * .68, z), (aft + .095, -width, z),
            (fore - .13, -width, z), (fore, -width * .68, z),
            (fore, width * .68, z), (fore - .13, width, z),
            (aft + .095, width, z), (aft, width * .68, z)]


def pilothouse():
    loft('Cream deckhouse', bridge_ring(-.19, .80, .411, .484),
         bridge_ring(-.17, .76, .392, .83), IVORY, bevel=.017)
    lower = bridge_ring(-.17, .75, .39, .861)
    upper = bridge_ring(-.20, .80, .432, 1.12)
    loft('Bridge sill', bridge_ring(-.205, .79, .447, .809),
         bridge_ring(-.205, .79, .447, .863), NAVY, bevel=.009)
    loft('Wraparound wheelhouse windows', lower, upper, GLASS)
    for foot, head in zip(lower, upper):
        beam('Bridge window mullion', foot, head, .033, IVORY)
    for side in (-1, 1):
        beam('Side window division', (.28, side * .395, .865), (.28, side * .434, 1.117), .029, IVORY)
        box('Machinery door', (-.027, side * .404, .654), (.14, .025, .228), NAVY, .012)
        tire('Lifebuoy with white lashings', (.445, side * .411, .671), .089, .024, ORANGE, markings=True)
    for y in (-.113, .113):
        beam('Forward window division', (.755, y, .86), (.80, y, 1.116), .028, IVORY)
    loft('Ivory roof coaming', bridge_ring(-.26, .845, .469, 1.108),
         bridge_ring(-.26, .845, .469, 1.16), IVORY, bevel=.012)
    loft('Rescue-orange bridge roof', bridge_ring(-.235, .825, .457, 1.158),
         bridge_ring(-.214, .80, .43, 1.202), ORANGE, bevel=.010)
    cylinder('Mast foot', (.17, 0, 1.224), .097, .055, IVORY, vertices=12, bevel=.007)
    cylinder('Signal mast', (.17, 0, 1.362), .034, .28, NAVY, vertices=10, bevel=0)
    box('Radar scanner', (.17, 0, 1.50), (.089, .39, .043), IVORY, .008)
    box('Skylight frame', (.53, -.16, 1.215), (.219, .183, .031), IVORY, .008)
    box('Smoked skylight', (.53, -.16, 1.234), (.174, .138, .012), GLASS, .005)
    cylinder('Amber beacon', (.54, .19, 1.262), .046, .106, '#FFC34E', vertices=10, bevel=.006)
    for side in (-1, 1):
        x, y = -.318, side * .358
        box('Magenta exhaust casing', (x, y, .84), (.16, .168, .51), MAGENTA, .025)
        cylinder('Exhaust cap', (x, y, 1.119), .086, .082, RUBBER, vertices=12, bevel=.009)
        cylinder('Exhaust mouth', (x, y, 1.162), .046, .010, '#17272D', vertices=12, bevel=0)


def tow_gear():
    x, z = -.76, .701
    box('Towing winch bedplate', (x, 0, .51), (.46, .72, .068), NAVY, .018)
    for side in (-1, 1):
        box('Winch bearing pedestal', (x, side * .29, .626), (.16, .071, .22), NAVY, .012)
    with moving_part('Towing winch', (x, 0, z)):
        cylinder('Reel of towline', (x, 0, z), .146, .414, ROPE, axis='Y', vertices=16, bevel=.012)
        for n in range(5):
            cylinder('Wound towline', (x, (n - 2) * .078, z), .150, .035, '#B39664',
                     axis='Y', vertices=16, bevel=.006)
        for side in (-1, 1):
            cylinder('Winch drum cheek', (x, side * .235, z), .192, .043, MAGENTA,
                     axis='Y', vertices=16, bevel=.006)
            for i in range(3):
                a = tau * i / 3
                beam('Drum arm', (x, side * .259, z),
                     (x + .155 * cos(a), side * .259, z + .155 * sin(a)), .026, IVORY)
    # A guarded stern roller feeds the hawser out aft toward the barge.
    x = -1.248
    cylinder('Stern tow roller', (x, 0, .57), .054, .40, RUBBER, axis='Y', vertices=12, bevel=.005)
    for y in (-.22, .22):
        cylinder('Towing pin', (x, y, .614), .049, .207, ORANGE, vertices=12, bevel=.008)
    for side in (-1, 1):
        y = side * .50
        for x in (-1.16, -.63):
            beam('Deck rail stanchion', (x, y, .50), (x, y, .665), .026, IVORY)
        beam('Aft handrail', (-1.20, y, .665), (-.58, y, .665), .032, IVORY)
    for y in (-.25, .25):
        cylinder('Foredeck bollard', (1.005, y, .615), .054, .13, NAVY, vertices=12, bevel=.006)
        cylinder('Bollard cap', (1.005, y, .68), .072, .025, IVORY, vertices=12, bevel=.004)
    box('Raised forepeak hatch', (1.074, 0, .588), (.226, .20, .055), IVORY, .010)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    hull()
    pilothouse()
    tow_gear()
    # One chamfer catches the studio light at board scale. Thin rails and cable
    # ribs keep a square section instead of paying for subpixel bevel faces.
    for obj in bpy.context.scene.objects:
        bevel = obj.modifiers.get('Painted edges')
        if bevel and bevel.width <= .008:
            obj.modifiers.remove(bevel)
        elif bevel:
            bevel.segments = 1
    parts = join_parts('Harbor tug')
    frames = 48
    key_motion(parts['Towing winch'], frames, lambda angle: (None, (0, angle, 0)))
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 0, frames
    scene.frame_set(0)
    bpy.ops.object.select_all(action='SELECT')
    DEST.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(DEST / 'harbor-tug.glb'), export_format='GLB',
                              use_selection=True, export_texcoords=False, export_cameras=False,
                              export_lights=False, export_animations=True,
                              export_animation_mode='ACTIVE_ACTIONS',
                              export_nla_strips_merged_animation_name='Tow', export_force_sampling=False)
    poster(parts.values(), DEST / 'harbor-tug.webp')


if __name__ == '__main__':
    build()
