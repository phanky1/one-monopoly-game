"""Rigid-body Idle loops. All motion is local to the miniature or its mechanical pivot."""

from math import cos, radians, sin, tau

import bpy
from mathutils import Euler, Vector


# Duration in frames (24 fps), heave in model units, roll and pitch in degrees.
SWELLS = {
    'one-apus': (108, .115, 5.5, 3.2),
    'one-magenta': (96, .105, -6.0, 3.8),
    'pilot-boat': (76, .16, 8.0, -5.0),
    'bunker-barge': (120, .095, -4.3, -2.8),
}


def key_motion(part, frames, pose):
    """Sample a periodic pose every two frames; glTF interpolates between keys."""
    origin = part.location.copy()
    last = None
    part.rotation_mode = 'QUATERNION'
    for frame in range(0, frames + 1, 2):
        heave, angles = pose(tau * frame / frames)
        if heave is not None:
            part.location = origin + Vector((0, 0, heave))
            part.keyframe_insert(data_path='location', frame=frame)
        rotation = Euler(angles).to_quaternion()
        if last is not None:
            rotation.make_compatible(last)
        part.rotation_quaternion = rotation
        part.keyframe_insert(data_path='rotation_quaternion', frame=frame)
        last = rotation
    for curve in part.animation_data.action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'


def apply_idle(name, parts):
    if name in SWELLS:
        frames, rise, roll, pitch = SWELLS[name]
        def swell(t):
            return (rise * (1 - cos(t)) / 2,
                    (radians(roll) * sin(t), radians(pitch) * (.76 * sin(t) + .24 * sin(2 * t)), 0))
        key_motion(parts['base'], frames, swell)
    elif name == 'gantry-crane':
        frames = 96
        key_motion(parts['sling'], frames, lambda t:
                   (None, (radians(5) * sin(t), radians(10) * sin(t) + radians(2) * (1 - cos(t)), 0)))
    elif name == 'container-truck':
        frames = 84
        key_motion(parts['cab'], frames, lambda t:
                   (.055 * (1 - cos(3 * t)) / 2, (radians(2.8) * sin(3 * t), radians(1.7) * sin(t), 0)))
    elif name == 'freight-train':
        frames = 96
        key_motion(parts['engine'], frames, lambda t:
                   (.040 * (1 - cos(3 * t)) / 2, (radians(2.2) * sin(3 * t), radians(.8) * sin(t), 0)))
        for part, turns in [('fan-aft', 5), ('fan-forward', -5)]:
            key_motion(parts[part], frames, lambda t: (None, (0, 0, turns * t)))
    elif name == 'reefer-truck':
        frames = 90
        key_motion(parts['cooler'], frames, lambda t:
                   (.036 * (1 - cos(3 * t)) / 2, (radians(2.3) * sin(3 * t), radians(.9) * sin(t), 0)))
        for part, turns in [('fan-left', 4), ('fan-right', -4)]:
            # The compressor fans accelerate and ease back over the cooling cycle.
            key_motion(parts[part], frames, lambda t: (None, (turns * (t - .35 * sin(t)), 0, 0)))
    else:
        raise ValueError(f'Missing idle motion for {name}')

    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 0, frames
    scene.frame_set(0)
