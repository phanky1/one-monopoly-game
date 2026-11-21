"""Land pieces share an X-forward orientation and stand on the z=0 plane."""

from math import cos, sin, tau

from studio import beam, box, cylinder, mesh, moving_part

TIRE = "#272e36"
UNDERFRAME = "#33404a"
STEEL = "#83939b"
RIM = "#c6d1d3"
GLASS = "#1c4556"
LAMP = "#fff1b8"


def _extrude_cab(name, profile, width, color, bevel=0.025):
    """Extrude an X/Z profile, listed counterclockwise, across the vehicle."""
    count = len(profile)
    verts = [(x, y, z) for y in (-width / 2, width / 2) for x, z in profile]
    faces = [list(range(count)), list(reversed(range(count, 2 * count)))]
    for i in range(count):
        j = (i + 1) % count
        faces.append([i, count + i, count + j, j])
    mesh(name, verts, faces, color, bevel=bevel)


def _impeller(name, center, radius, axis):
    """Four swept blades behind the fixed intake guard, on a single rotor."""
    cx, cy, cz = center
    vertices, faces = [], []
    for i in range(4):
        phi = tau * i / 4
        start = len(vertices)
        for r, angle in ((.12, -.65), (.90, -.40), (1, .30), (.50, .13), (.12, .40)):
            u, v = radius * r * cos(phi + angle), radius * r * sin(phi + angle)
            vertices.append((cx, cy + u, cz + v) if axis == 'X' else (cx + u, cy + v, cz))
        faces.append(list(range(start, start + 5)))
    mesh(name, vertices, faces, '#bbccd0', bevel=0)
    cylinder(name + ' hub', center, radius * .17, .012, '#719399',
             axis=axis, vertices=10, bevel=0)


def _wheels(name, axles, track, radius, tire_width):
    for x in axles:
        cylinder(name + ' axle', (x, 0, radius), radius * 0.30, track, UNDERFRAME,
                 axis='Y', vertices=8, bevel=0)
        for side in (-1, 1):
            y = side * track / 2
            cylinder(name + ' tire', (x, y, radius), radius, tire_width, TIRE,
                     axis='Y', vertices=16, bevel=0.022)
            face = y + side * tire_width / 2
            cylinder(name + ' wheel rim', (x, face, radius), radius * 0.65, 0.024, RIM,
                     axis='Y', vertices=12, bevel=0.009)
            cylinder(name + ' axle cap', (x, face + side * 0.019, radius),
                     radius * 0.31, 0.029, UNDERFRAME, axis='Y', vertices=10, bevel=0.007)


def _road_cab(name, rear, front, roof, color):
    """A forward-control cab with inset doors and a raked windshield."""
    width = 0.97
    sill = roof - 0.41
    _extrude_cab(name, [(rear, 0.37), (front, 0.37), (front, sill),
                        (front - 0.13, roof), (rear, roof)], width, color, bevel=0.04)
    # A separate inset pane follows the rake at the front of the cab.
    mesh(name + ' windshield',
         [(front - 0.015, -0.425, sill + 0.065), (front - 0.015, 0.425, sill + 0.065),
          (front - 0.110, 0.41, roof - 0.05), (front - 0.110, -0.41, roof - 0.05)],
         [[0, 1, 2, 3]], GLASS, bevel=0)
    for side in (-1, 1):
        y = side * (width / 2 + 0.003)
        pane = [(rear + 0.075, y, sill + 0.07), (front - 0.08, y, sill + 0.07),
                (front - 0.165, y, roof - 0.065), (rear + 0.075, y, roof - 0.065)]
        mesh(name + ' side glass', pane, [[0, 1, 2, 3] if side == -1 else [3, 2, 1, 0]],
             GLASS, bevel=0)
        box(name + ' door handle', (rear + 0.12, y, sill - 0.015), (0.105, 0.021, 0.025),
            UNDERFRAME, bevel=0.006)
        box(name + ' mirror', (front - 0.14, side * 0.545, roof - 0.19), (0.065, 0.09, 0.13),
            UNDERFRAME, bevel=0.018)
        box(name + ' headlight', (front + 0.009, side * 0.355, 0.495),
            (0.035, 0.15, 0.085), LAMP, bevel=0.012)
    box(name + ' grille', (front + 0.006, 0, 0.50), (0.035, 0.44, 0.15), UNDERFRAME, bevel=0.015)
    box(name + ' bumper', (front + 0.015, 0, 0.36), (0.10, 0.99, 0.105), STEEL, bevel=0.02)


def _freight_box(name, x, z, length, width, height, paint, rib_color, rib_count):
    """Closed ISO container, with raised ribs and reinforced outer rails."""
    box(name, (x, 0, z), (length, width, height), paint, bevel=0.027)
    for side in (-1, 1):
        y = side * width / 2
        for i in range(rib_count):
            rib_x = x + length * ((i + 0.5) / rib_count - 0.5)
            box(name + ' corrugation', (rib_x, y, z), (0.033, 0.038, height - 0.11),
                rib_color, bevel=0.009)
        for edge in (-1, 1):
            box(name + ' side rail', (x, y, z + edge * (height - 0.046) / 2),
                (length, 0.052, 0.046), rib_color, bevel=0.008)


def build_crane():
    """Rail-mounted ship-to-shore gantry with a suspended spreader and load."""
    ochre, gold, shadow = '#da8b29', '#ffc45b', '#aa6725'
    # Two portal frames leave a clear passage at the base.
    for side in (-1, 1):
        y = side * 0.57
        box('Portal sill', (-0.29, y, 0.22), (1.73, 0.15, 0.16), shadow)
        for x in (-1.04, 0.44):
            for dx in (-0.10, 0.10):
                cylinder('Gantry travel wheel', (x + dx, y, 0.091), 0.091, 0.15, UNDERFRAME,
                         axis='Y', vertices=10, bevel=0.009)
        beam('Landside leg', (-1.04, y, 0.27), (-0.81, y, 1.64), 0.15, ochre)
        beam('Waterside leg', (0.44, y, 0.27), (0.29, y, 1.64), 0.16, ochre)
        beam('Portal crosshead', (-1.04, y, 1.03), (0.40, y, 1.03), 0.11, gold)
        beam('Portal knee brace', (-0.99, y, 0.77), (-0.73, y, 1.04), 0.07, shadow)
        beam('Portal knee brace', (0.37, y, 0.77), (0.13, y, 1.04), 0.07, shadow)
        # Raised lattice boom: two chords with zigzag diagonals.
        for level in (1.61, 1.87):
            box('Boom chord', (0.06, y, level), (3.26, 0.095, 0.085), gold, bevel=0.01)
        for i in range(8):
            x0 = -1.55 + 0.40 * i
            z0, z1 = (1.61, 1.87) if i % 2 == 0 else (1.87, 1.61)
            beam('Boom lattice', (x0, y, z0), (x0 + 0.40, y, z1), 0.053, ochre)
        beam('Stay tower', (0.25, y, 1.84), (-0.06, y, 2.35), 0.095, ochre)
        beam('Tower backstay', (-0.86, y, 1.84), (-0.06, y, 2.35), 0.08, ochre)
        beam('Boom stay cable', (-0.06, y, 2.35), (1.64, y, 1.87), 0.024, UNDERFRAME)
    for x in (-1.39, -0.82, 0.26, 1.66):
        box('Boom cross tie', (x, 0, 1.61), (0.095, 1.19, 0.09), ochre)
    box('Tower cap', (-0.06, 0, 2.34), (0.10, 1.21, 0.10), gold)
    box('Machinery housing', (-1.08, 0, 1.83), (0.66, 0.96, 0.35), ochre)
    box('Machinery roof', (-1.08, 0, 2.016), (0.72, 1.03, 0.055), gold)
    box('Hoist trolley', (1.05, 0, 1.57), (0.48, 1.06, 0.12), UNDERFRAME)
    box('Operator cab', (0.80, -0.42, 1.41), (0.30, 0.28, 0.25), gold)
    box('Cab glass', (0.81, -0.564, 1.44), (0.23, 0.018, 0.12), GLASS, bevel=0.01)
    with moving_part('sling', (1.15, 0, 1.53)):
        for dx in (-0.16, 0.16):
            for dy in (-0.22, 0.22):
                beam('Hoist rope', (1.15 + dx, dy, 1.53), (1.15 + dx, dy, 0.94), 0.020, UNDERFRAME)
        box('Spreader', (1.15, 0, 0.91), (0.81, 0.56, 0.09), gold)
        _freight_box('Suspended container', 1.15, 0.63, 0.90, 0.57, 0.47, '#b92d67', '#ef5b91', 6)


def build_truck():
    """Separate tractor and semi-trailer joined under a blue steel container."""
    box('Tractor chassis', (0.70, 0, 0.31), (1.73, 0.48, 0.15), UNDERFRAME)
    box('Trailer chassis', (-0.65, 0, 0.55), (2.03, 0.66, 0.15), UNDERFRAME)
    box('Trailer deck', (-0.65, 0, 0.65), (2.09, 1.16, 0.10), STEEL)
    _wheels('Tractor', [1.32, 0.12], 0.85, 0.25, 0.19)
    _wheels('Trailer', [-1.40, -0.87], 0.96, 0.23, 0.18)
    for side in (-1, 1):
        box('Trailer suspension', (-1.135, side * 0.32, 0.365),
            (0.77, 0.12, 0.28), UNDERFRAME)
    for side in (-1, 1):
        cylinder('Diesel tank', (0.54, side * 0.35, 0.35), 0.14, 0.38,
                 STEEL, axis='X', vertices=12)
    _freight_box('Intermodal container', -0.65, 1.12, 2.04, 1.14, 0.84, '#1d6390', '#3886ae', 11)
    with moving_part('cab', (1.2, 0, 0.43)):
        _road_cab('Sleeper tractor', 0.67, 1.65, 1.20, '#e99e46')
        _extrude_cab('Roof fairing', [(0.67, 1.17), (1.53, 1.17), (1.18, 1.39), (0.67, 1.46)],
                     0.93, '#f4b768')


def build_reefer():
    """Rigid insulated truck with a high-mounted twin-fan refrigeration pack."""
    box('Rigid chassis', (-0.06, 0, 0.31), (3.20, 0.58, 0.16), UNDERFRAME)
    _wheels('Reefer', [-1.18, 1.27], 0.91, 0.255, 0.20)
    with moving_part('cooler', (0, 0, 0.5)):
        box('Insulated cargo body', (-0.56, 0, 1.07), (2.22, 1.15, 1.03), '#f3f4e8', bevel=0.047)
        box('Cold store underframe', (-0.56, 0, 0.555), (2.26, 1.19, 0.105), '#7f9aab')
        for side in (-1, 1):
            y = side * 0.577
            box('Insulated body belt', (-0.56, y, 0.76), (2.18, 0.022, 0.078), '#409bac', bevel=0.008)
            for x in (-1.61, -0.90, -0.19, 0.50):
                box('Panel seam', (x, y, 1.17), (0.026, 0.015, 0.72), '#c8d7d8', bevel=0.005)
            box('Side underrun guard', (-0.12, side * 0.48, 0.36),
                (1.10, 0.075, 0.085), STEEL)
        _road_cab('Rigid truck cab', 0.75, 1.65, 1.11, '#39899a')
        box('Refrigeration pack', (0.62, 0, 1.39), (0.27, 0.98, 0.38),
            '#dce8e7', bevel=0.055)
        for side in (-1, 1):
            y = side * 0.238
            cylinder('Condenser grille', (0.764, y, 1.40), 0.151, 0.021,
                     UNDERFRAME, axis='X', vertices=16, bevel=0.005)
            with moving_part('fan-left' if side < 0 else 'fan-right', (0.778, y, 1.40), 'cooler'):
                _impeller('Condenser rotor', (0.778, y, 1.40), .14, 'X')
            for dz in (-0.067, 0, 0.067):
                box('Condenser louver', (0.792, y, 1.40 + dz), (0.027, 0.23, 0.023),
                    STEEL, bevel=0.005)


def build_train():
    """Diesel road switcher with an offset cab, long hood and two bogies."""
    green, stripe = '#276958', '#f1bb60'
    for center in (-0.93, 0.91):
        _wheels('Rail', [center - 0.25, center + 0.25], 0.84, 0.212, 0.12)
        for side in (-1, 1):
            box('Bogie side frame', (center, side * 0.485, 0.265),
                (0.79, 0.07, 0.14), '#536267')
    with moving_part('engine', (0, 0, 0.45)):
        box('Locomotive deck', (0, 0, 0.445), (3.36, 1.23, 0.17), UNDERFRAME)
        box('Running board edge', (0, 0, 0.525), (3.33, 1.23, 0.055), stripe)
        box('Fuel reservoir', (-0.02, 0, 0.285), (0.72, 0.81, 0.24), '#657276', bevel=0.06)
        box('Long engine hood', (-0.49, 0, 0.90), (1.96, 0.82, 0.73), green, bevel=0.07)
        for y in (-0.415, 0.415):
            box('Livery stripe', (-0.49, y, 0.77), (1.87, 0.02, 0.105), stripe, bevel=0.008)
            for x in (-1.17, -0.91, -0.64, -0.37):
                box('Engine air intake', (x, y, 1.035), (0.145, 0.027, 0.19),
                    '#254842', bevel=0.01)
        for x in (-1.04, -0.52):
            cylinder('Roof fan housing', (x, 0, 1.264), 0.206, 0.043, UNDERFRAME, vertices=16)
            with moving_part('fan-aft' if x < -.8 else 'fan-forward', (x, 0, 1.289), 'engine'):
                _impeller('Radiator rotor', (x, 0, 1.289), .19, 'Z')
            for dy in (-0.075, 0, 0.075):
                box('Fan grille', (x, dy, 1.304), (0.30, 0.025, 0.022), STEEL, bevel=0.004)
        cylinder('Exhaust', (0.06, 0, 1.31), 0.081, 0.135, UNDERFRAME, vertices=12)
        box('Cab base', (0.69, 0, 0.94), (0.73, 1.04, 0.81), green)
        box('Cab glazing', (0.69, 0, 1.24), (0.74, 1.045, 0.275), GLASS)
        for x in (0.35, 0.72, 1.03):
            for side in (-1, 1):
                box('Cab pillar', (x, side * 0.522, 1.24), (0.055, 0.032, 0.275), '#d4decc', bevel=0.008)
        box('Windscreen divider', (1.065, 0, 1.25), (0.04, 0.047, 0.26), '#d4decc', bevel=0.008)
        box('Cab roof', (0.69, 0, 1.414), (0.86, 1.16, 0.10), '#d4decc', bevel=0.036)
        _extrude_cab('Short hood', [(0.96, 0.545), (1.54, 0.545), (1.54, 0.93),
                                    (1.39, 1.04), (0.96, 1.04)], 0.72, green)
        for y in (-0.19, 0.19):
            cylinder('Headlight', (1.55, y, 0.865), 0.068, 0.04, LAMP,
                     axis='X', vertices=12, bevel=0.009)
        for side in (-1, 1):
            y = side * 0.565
            for x in (-1.54, -0.87, -0.13):
                beam('Handrail stanchion', (x, y, 0.54), (x, y, 0.89), 0.033, stripe)
            beam('Walkway handrail', (-1.54, y, 0.89), (-0.13, y, 0.89), 0.033, stripe)
        _extrude_cab('Pilot plow', [(1.40, 0.16), (1.72, 0.16), (1.59, 0.41), (1.46, 0.41)],
                     1.11, '#485760')
