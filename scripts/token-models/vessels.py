"""Painted ocean-fleet miniatures. The bow is +X and the waterline is Z=0."""

from studio import beam, box, cylinder, ellipsoid, mesh


IVORY = '#F4EEDD'
GLASS = '#194654'
INK = '#25353C'
BRASS = '#E6AE50'


def loft(name, lower, upper, color, bevel=0.015):
    """Close two counter-clockwise rings into a solid with outward-facing normals."""
    count = len(lower)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh(name, lower + upper, faces, color, bevel=bevel)


def hull(stations, height, freeboard, keel, deck):
    """Flared sides, a contrasting boot stripe and a stepped weather deck."""
    outline = [(x, -y) for x, y in stations] + list(reversed(stations))

    def ring(scale_x, scale_y, z):
        return [(x * scale_x, y * scale_y, z) for x, y in outline]

    bottom = ring(0.91, 0.66, 0.02)
    waterline = ring(0.975, 0.91, height * 0.31)
    rail = ring(1, 1, height)
    loft('Lower hull', bottom, waterline, keel)
    loft('Painted topsides', waterline, rail, freeboard)
    loft('Weather deck', rail, ring(0.992, 0.975, height + 0.026), deck, bevel=0.008)


def bridge(x, deck_z, width, height, cap_color):
    """Tiered accommodation and a projecting wraparound wheelhouse."""
    box('Accommodation', (x, 0, deck_z + height / 2), (0.43, width * 0.76, height), IVORY)
    for side in (-1, 1):
        box('Cabin ports', (x, side * width * 0.384, deck_z + height * 0.63),
            (0.24, 0.018, 0.05), GLASS, bevel=0.006)
    floor = deck_z + height
    box('Bridge wings', (x, 0, floor), (0.52, width, 0.085), IVORY, bevel=0.018)
    box('Wheelhouse glazing', (x + 0.015, 0, floor + 0.09),
        (0.43, width * 0.87, 0.15), GLASS, bevel=0.025)
    for y in (-width * 0.22, width * 0.22):
        box('Forward mullion', (x + 0.234, y, floor + 0.09),
            (0.018, 0.027, 0.14), IVORY, bevel=0)
    box('Bridge roof', (x, 0, floor + 0.19), (0.5, width * 0.98, 0.055), cap_color, bevel=0.014)


def cargo_stack(x, y, deck_z, colors, length=0.53, width=0.39):
    for tier, color in enumerate(colors):
        z = deck_z + 0.106 + tier * 0.207
        box('Intermodal box', (x, y, z), (length, width, 0.204), color, bevel=0.014)
    # Three corrugations on the exposed upper container catch the light at larger sizes.
    side = 1 if y > 0 else -1
    for offset in (-0.28, 0, 0.28):
        box('Container rib', (x + length * offset, y + side * width / 2, z),
            (0.018, 0.013, 0.154), colors[-1], bevel=0.003)


def build_apus():
    """Deep-magenta liner, three cargo bays and an aft island bridge."""
    hull([(-1.64, 0.34), (-1.48, 0.51), (-1.18, 0.58), (0.83, 0.58),
          (1.20, 0.46), (1.48, 0.26), (1.71, 0.035)], 0.50, '#BF165F', '#253C50', '#596D71')
    bays = [(-0.59, ['#307A84', '#CA5E57'], ['#DAAC52', '#557B87']),
            (0.00, ['#D89450', '#287782', '#E0BD68'], ['#B73E65', '#32908D']),
            (0.59, ['#386A80', '#BD4567'], ['#D59052', '#588C95'])]
    for x, near, far in bays:
        cargo_stack(x, -0.212, 0.536, near)
        cargo_stack(x, 0.212, 0.536, far)
    bridge(-1.10, 0.526, 0.91, 0.52, IVORY)
    box('Funnel casing', (-1.44, 0.03, 0.78), (0.20, 0.27, 0.50), '#BC235E')
    box('Funnel cap', (-1.44, 0.03, 1.036), (0.20, 0.27, 0.08), INK)
    cylinder('Bridge mast', (-1.15, 0, 1.32), 0.024, 0.17, IVORY, vertices=10)
    box('Radar scanner', (-1.15, 0, 1.418), (0.05, 0.26, 0.035), GLASS, bevel=0.008)
    for y in (-0.417, 0.417):
        ellipsoid('Covered lifeboat', (-1.12, y, 0.74), (0.30, 0.11, 0.11), '#F09A3B')
    for y in (-0.12, 0.12):
        cylinder('Bow capstan', (1.23, y, 0.574), 0.07, 0.09, INK, vertices=10)


def cargo_crane(x, deck_z):
    """Pedestal crane with angled boom and topping lift."""
    cylinder('Crane pedestal', (x, 0, deck_z + 0.21), 0.092, 0.42, '#D89F48', vertices=12)
    box('Crane cab', (x + 0.035, 0, deck_z + 0.47), (0.23, 0.20, 0.18), BRASS)
    box('Crane cab glass', (x + 0.035, -0.102, deck_z + 0.49), (0.15, 0.013, 0.078), GLASS, bevel=0.006)
    shoulder = (x, 0, deck_z + 0.46)
    head = (x - 0.55, 0, deck_z + 0.77)
    apex = (x + 0.04, 0, deck_z + 0.82)
    beam('Crane boom', shoulder, head, 0.09, '#ECAF50')
    beam('Kingpost', shoulder, apex, 0.075, IVORY)
    beam('Topping lift', apex, head, 0.022, GLASS)
    beam('Hoist', head, (head[0], 0, head[2] - 0.14), 0.023, INK)


def build_magenta():
    """Rose-pink geared feeder with forward bridge and two working cranes."""
    hull([(-1.60, 0.40), (-1.43, 0.57), (-1.12, 0.61), (0.80, 0.61),
          (1.18, 0.49), (1.53, 0.24), (1.69, 0.045)], 0.48, '#EC3888', '#663655', '#788386')
    for x, colors in [(-1.05, ['#478C9B', '#538DA3']), (-0.28, ['#C0516A', '#DB9964'])]:
        cargo_stack(x, -0.27, 0.506, colors, length=0.52, width=0.37)
        cargo_stack(x, 0.27, 0.506, ['#4A718C'], length=0.52, width=0.37)
    for x in (-0.68, 0.10):
        cargo_crane(x, 0.51)
    bridge(0.78, 0.51, 0.88, 0.42, '#EDE0C6')
    box('Aft exhaust', (0.45, 0.13, 0.84), (0.17, 0.21, 0.52), '#EC3888')
    box('Exhaust collar', (0.45, 0.13, 1.105), (0.18, 0.22, 0.06), INK)
    for y in (-0.17, 0.17):
        cylinder('Windlass', (1.26, y, 0.551), 0.085, 0.085, GLASS, vertices=12)


def build_pilot():
    """Cobalt pilot launch with a V hull, rubber fenders and a raked orange-roof cabin."""
    hull([(-1.37, 0.40), (-1.15, 0.54), (-0.50, 0.60), (0.57, 0.56),
          (1.00, 0.42), (1.36, 0.19), (1.60, 0.028)], 0.44, '#237AB2', '#162F42', '#F1E4CA')
    fender = [(-1.33, 0.42, 0.41), (-1.14, 0.53, 0.42), (-0.49, 0.59, 0.43),
              (0.55, 0.55, 0.43), (1.00, 0.42, 0.43), (1.36, 0.19, 0.43), (1.56, 0.03, 0.43)]
    for side in (-1, 1):
        rail = [(x, y * side, z) for x, y, z in fender]
        for start, end in zip(rail, rail[1:]):
            beam('Rub rail', start, end, 0.072, INK)

    def cabin_ring(aft, fore, width, z):
        return [(aft, -width, z), (fore, -width, z), (fore, width, z), (aft, width, z)]

    foot = cabin_ring(-0.68, 0.67, 0.422, 0.468)
    sill = cabin_ring(-0.65, 0.61, 0.413, 0.70)
    eave = cabin_ring(-0.55, 0.36, 0.355, 1.05)
    loft('Raised cabin', foot, sill, IVORY)
    loft('Panoramic windows', sill, eave, '#214957')
    for y in (-1, 1):
        for low_x, high_x in [(-0.65, -0.55), (-0.13, -0.15), (0.61, 0.36)]:
            beam('Window pillar', (low_x, y * 0.414, 0.70), (high_x, y * 0.356, 1.05), 0.046, IVORY)
    beam('Windscreen bar', (0.612, 0, 0.70), (0.36, 0, 1.05), 0.036, IVORY)
    box('Orange cabin roof', (-0.09, 0, 1.082), (1.07, 0.84, 0.085), '#F78B34')
    cylinder('Radar base', (-0.33, 0, 1.18), 0.05, 0.12, GLASS, vertices=12)
    box('Radar scanner', (-0.33, 0, 1.258), (0.12, 0.47, 0.062), IVORY)
    cylinder('Pilot beacon', (0.22, 0, 1.171), 0.065, 0.08, '#F4BD4F', vertices=12)
    for y in (-0.22, 0.22):
        box('Outboard cowling', (-1.36, y, 0.56), (0.32, 0.19, 0.28), '#32424B', bevel=0.06)
        beam('Bow stanchion', (0.78, y, 0.48), (0.78, y, 0.61), 0.035, IVORY)
        beam('Bow handrail', (0.78, y, 0.61), (1.31, y * 0.63, 0.56), 0.035, IVORY)


def build_barge():
    """Violet LNG bunker barge, with three insulated tanks and deckside transfer piping."""
    hull([(-1.63, 0.50), (-1.47, 0.62), (0.98, 0.62), (1.35, 0.51),
          (1.61, 0.31)], 0.335, '#78548F', '#394253', '#677E7B')
    for x in (-0.63, 0.14, 0.91):
        cylinder('Insulated tank skirt', (x, 0, 0.45), 0.348, 0.17, '#648581', vertices=20)
        ellipsoid('Pressure tank', (x, 0, 0.62), (0.74, 0.82, 0.75), '#CCE0D2')
        cylinder('Valve hatch', (x, 0, 0.995), 0.087, 0.057, INK, vertices=12)
        cylinder('Valve cap', (x, 0, 1.033), 0.047, 0.035, BRASS, vertices=10)
    bridge(-1.27, 0.365, 0.76, 0.38, '#E0D4BE')
    cylinder('Gas transfer main', (0.17, -0.465, 0.508), 0.065, 2.30, '#DBAA57', axis='X', vertices=12)
    for x in (-0.79, -0.18, 0.47, 1.13):
        cylinder('Pipe flange', (x, -0.465, 0.508), 0.094, 0.049, '#42666A', axis='X', vertices=12)
        box('Pipe stool', (x, -0.465, 0.398), (0.11, 0.13, 0.08), INK)
    cylinder('Loading arm swivel', (1.17, 0.31, 0.46), 0.089, 0.18, '#986D3E', vertices=12)
    beam('Loading arm riser', (1.17, 0.31, 0.51), (1.08, 0.31, 1.04), 0.068, BRASS)
    beam('Loading arm elbow', (1.08, 0.31, 1.04), (0.72, 0.31, 0.83), 0.068, BRASS)
