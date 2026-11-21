"""Rebuild shipped GLBs and transparent picker posters using Blender 4.3.2.

From the repository root run:
    blender -b -t 4 -P scripts/token-models/build.py
Append -- one-apus pilot-boat to regenerate just those pieces.
Append -- --glb-only to rebuild all animated models without rerendering the posters.
"""

from collections import defaultdict
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

SOURCE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(SOURCE))
from idle import apply_idle
from vessels import build_apus, build_magenta, build_pilot, build_barge
from vehicles import build_crane, build_truck, build_train, build_reefer

MODELS = {
    "one-apus": build_apus, "one-magenta": build_magenta,
    "gantry-crane": build_crane, "container-truck": build_truck,
    "freight-train": build_train, "reefer-truck": build_reefer,
    "pilot-boat": build_pilot, "bunker-barge": build_barge,
}
DEST = SOURCE.parents[1] / "packages/client/public/models/tokens"


def add_light(name, offset, target, power, size, tint):
    lamp = bpy.data.lights.new(name, "AREA")
    lamp.energy, lamp.shape, lamp.size, lamp.color = power, "DISK", size, tint
    light = bpy.data.objects.new(name, lamp)
    bpy.context.collection.objects.link(light)
    light.location = target + Vector(offset)
    light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()


def poster(parts, path):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = 480
    scene.render.resolution_y = 360
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new("Softbox")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.75, .85, 1, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .42

    points = [obj.matrix_world @ v.co for obj in parts for v in obj.data.vertices]
    center = Vector([(min(p[i] for p in points) + max(p[i] for p in points)) / 2
                     for i in range(3)])
    view = Vector((4, -7, 4.8)).normalized()
    rotation = (-view).to_track_quat('-Z', 'Y')
    right, up = rotation @ Vector((1, 0, 0)), rotation @ Vector((0, 1, 0))
    def extent(axis):
        projected = [(p-center).dot(axis) for p in points]
        return min(projected), max(projected)
    left, rightmost = extent(right)
    bottom, top = extent(up)
    focus = center + right * ((left+rightmost)/2) + up * ((bottom+top)/2)
    camera = bpy.data.cameras.new("Harbor studio")
    camera.type = 'ORTHO'
    camera.ortho_scale = 1.12 * max(rightmost-left, (top-bottom)*4/3)
    obj = bpy.data.objects.new("Camera", camera)
    bpy.context.collection.objects.link(obj)
    obj.location, obj.rotation_euler = focus + view*8, rotation.to_euler()
    scene.camera = obj
    add_light("Key", (1, -4, 6), center, 490, 5, (1, .94, .87))
    add_light("Fill", (-4, -2, 2), center, 150, 4, (.78, .88, 1))
    add_light("Rim", (-1, 4, 4), center, 440, 3, (1, .91, .81))
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 94
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def join_parts(name):
    """Keep just one mesh per pivot and express child coordinates in its parent's space."""
    groups = defaultdict(list)
    for obj in bpy.context.scene.objects:
        groups[obj.get('idle_part', 'base')].append(obj)

    parts, pivots, parents = {}, {}, {}
    for label, objects in groups.items():
        pivot = Vector(objects[0].get('idle_pivot', (0, 0, 0)))
        pivots[label] = pivot
        parents[label] = objects[0].get('idle_parent')
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.convert(target='MESH')
        if len(objects) > 1:
            bpy.ops.object.join()
        joined = bpy.context.object
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        joined.data.transform(Matrix.Translation(-pivot))
        joined.name = name if label == 'base' else label
        parts[label] = joined

    for label, part in parts.items():
        parent = parents[label]
        part.location = pivots[label]
        if parent is not None:
            part.parent = parts[parent]
            part.location -= pivots[parent]
    return parts


def build(name, render_poster):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MODELS[name]()
    parts = join_parts(name)
    apply_idle(name, parts)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(DEST / (name + ".glb")),
                              export_format='GLB', use_selection=True,
                              export_texcoords=False, export_animations=True,
                              export_animation_mode='ACTIVE_ACTIONS',
                              export_nla_strips_merged_animation_name='Idle',
                              export_force_sampling=False,
                              export_cameras=False, export_lights=False)
    if render_poster:
        poster(parts.values(), DEST / (name + ".webp"))


if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    names = [name for name in args if name != '--glb-only'] or MODELS
    for name in names:
        build(name, render_poster='--glb-only' not in args)
