"""Low-poly mesh and enamel material tools. Coordinates are X forward, Z up."""

from contextlib import contextmanager
import math

import bmesh
import bpy
from mathutils import Vector


@contextmanager
def moving_part(name, pivot, parent="base"):
    """Group the meshes made inside this block around one mechanical joint."""
    before = set(bpy.data.objects)
    yield
    for obj in set(bpy.data.objects) - before:
        # An inner block has already tagged any articulated child parts.
        if "idle_part" not in obj:
            obj["idle_part"] = name
            obj["idle_pivot"] = pivot
            obj["idle_parent"] = parent


def paint(hex_color):
    name = "Enamel " + hex_color.upper()
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    # Blender material slots take linear colors, while the design swatches are sRGB.
    def linear(channel):
        value = int(channel, 16) / 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
    color = tuple(linear(hex_color[i:i+2]) for i in (1, 3, 5)) + (1.0,)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = 0.47
    shader.inputs["Metallic"].default_value = 0.10
    return mat


def mesh(name, verts, faces, color, bevel=0.02):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    # Hull sections and mirrored pieces can be drawn in either winding order.
    edit = bmesh.new()
    edit.from_mesh(data)
    bmesh.ops.recalc_face_normals(edit, faces=edit.faces)
    edit.to_mesh(data)
    edit.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(paint(color))
    if bevel > 0:
        edge = obj.modifiers.new("Painted edges", "BEVEL")
        edge.width = bevel
        edge.segments = 2
        edge.limit_method = "ANGLE"
        edge.harden_normals = True
        normals = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True
    return obj


def box(name, center, size, color, bevel=0.03):
    x, y, z = (s / 2 for s in size)
    verts = [(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z),
             (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)]
    faces = [(0,3,2,1), (4,5,6,7), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7)]
    obj = mesh(name, verts, faces, color, bevel)
    obj.location = center
    return obj


def cylinder(name, center, radius, depth, color, axis='Z', vertices=16, bevel=0.02):
    ring = [(radius * math.cos(2 * math.pi * i / vertices),
             radius * math.sin(2 * math.pi * i / vertices)) for i in range(vertices)]
    verts = [(x,y,z) for z in (-depth / 2, depth / 2) for x,y in ring]
    faces = [tuple(reversed(range(vertices))), tuple(range(vertices, 2 * vertices))]
    for i in range(vertices):
        j = (i + 1) % vertices
        faces.append((i, j, vertices + j, vertices + i))
    obj = mesh(name, verts, faces, color, bevel)
    obj.location = center
    if axis == 'X':
        obj.rotation_euler.y = math.pi / 2
    elif axis == 'Y':
        obj.rotation_euler.x = math.pi / 2
    return obj


def beam(name, start, end, width, color):
    start, end = Vector(start), Vector(end)
    direction = end - start
    obj = box(name, (start + end) / 2, (width, width, direction.length),
              color, min(0.008, width / 6))
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return obj


def ellipsoid(name, center, size, color):
    data = bpy.data.meshes.new(name)
    edit = bmesh.new()
    bmesh.ops.create_uvsphere(edit, u_segments=16, v_segments=8, radius=1)
    for vert in edit.verts:
        for i in range(3):
            vert.co[i] *= size[i] / 2
    edit.to_mesh(data)
    edit.free()
    for face in data.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = center
    data.materials.append(paint(color))
    return obj
