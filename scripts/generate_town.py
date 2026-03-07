#!/usr/bin/env python3
"""
Generate the Agent Town Tiled JSON map.

Produces a 50x40 tile map (48x48 px tiles) with:
  - Forest borders
  - Residential area (agent homes)
  - Central park / break room
  - Office buildings
  - Main road network
  - Town square
  - Spawn points
"""

import json
import os

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
COLS = 50
ROWS = 40
TILE_SIZE = 48
TOTAL = COLS * ROWS

# Tile GIDs
GRASS_A = 711
GRASS_B1 = 739
GRASS_B2 = 740
GRASS_C = 767

PATH = 712

# Trees (world2 tileset, firstgid=449)
TREE_TRUNK_TL = 513
TREE_TRUNK_TR = 514
TREE_TOP_TL = 481
TREE_TOP_TR = 482

# Tree canopy (world tileset, firstgid=193) - for above_player
CANOPY_TL = 193
CANOPY_TR = 194

# Hedges / fences (world2)
HEDGE_L = 529
HEDGE_R = 530

# Flowers (world2)
FLOWER = 450

# Signs / mailbox (world)
SIGN = 436
MAILBOX = 437

# Fence bottom (grounds2)
FENCE_BOTTOM = 1076

# Small house GIDs (world tileset, 5 cols x 3 rows)
HOUSE_TOP    = [366, 367, 368, 415, 416]
HOUSE_MID    = [265, 382, 383, 384, 265]
HOUSE_BOT    = [281, 398, 399, 400, 281]

# Lab / large building GIDs (world tileset, 7 cols x 3 rows)
LAB_TOP = [225, 226, 227, 228, 229, 230, 231]
LAB_MID = [241, 242, 243, 244, 245, 246, 247]
LAB_BOT = [257, 258, 259, 260, 261, 262, 263]

# Path border tiles (grounds2)
PB_TL = 1019
PB_TR = 1020
PB_BL = 1047
PB_BR = 1049
PB_H = 1021  # horizontal border piece

# ---------------------------------------------------------------------------
# Helper: layer as flat list
# ---------------------------------------------------------------------------

def make_layer(name="", layer_type="tilelayer"):
    return [0] * TOTAL


def idx(r, c):
    """Row, col -> flat index."""
    return r * COLS + c


def grass_gid(r):
    """Return the grass tile for a given row based on the 3-row repeating pattern."""
    phase = r % 3
    if phase == 0:
        return GRASS_A
    elif phase == 1:
        return None  # alternating 739/740
    else:
        return GRASS_C


def fill_grass(layer):
    """Fill entire layer with grass pattern."""
    for r in range(ROWS):
        phase = r % 3
        for c in range(COLS):
            if phase == 0:
                layer[idx(r, c)] = GRASS_A
            elif phase == 1:
                layer[idx(r, c)] = GRASS_B1 if c % 2 == 0 else GRASS_B2
            else:
                layer[idx(r, c)] = GRASS_C


def place_tiles(layer, r, c, tile_rows):
    """Place a multi-row tile pattern. tile_rows is list of lists."""
    for dr, row in enumerate(tile_rows):
        for dc, gid in enumerate(row):
            if 0 <= r + dr < ROWS and 0 <= c + dc < COLS and gid != 0:
                layer[idx(r + dr, c + dc)] = gid


def place_small_house(world_layer, r, c):
    """Place a 5-wide x 3-tall small house at (r, c)."""
    place_tiles(world_layer, r, c, [HOUSE_TOP, HOUSE_MID, HOUSE_BOT])


def place_lab(world_layer, r, c):
    """Place a 7-wide x 3-tall lab building at (r, c)."""
    place_tiles(world_layer, r, c, [LAB_TOP, LAB_MID, LAB_BOT])


def place_tree(world_layer, above_layer, r, c):
    """Place a 2-wide tree. Canopy at row r, trunk at row r+1."""
    if 0 <= r < ROWS and 0 <= c + 1 < COLS:
        above_layer[idx(r, c)] = CANOPY_TL
        above_layer[idx(r, c + 1)] = CANOPY_TR
    if 0 <= r + 1 < ROWS and 0 <= c + 1 < COLS:
        world_layer[idx(r + 1, c)] = TREE_TRUNK_TL
        world_layer[idx(r + 1, c + 1)] = TREE_TRUNK_TR


def place_hpath(layer, r, c_start, c_end):
    """Place horizontal 2-row path from c_start to c_end at rows r and r+1."""
    for c in range(c_start, c_end):
        if 0 <= r < ROWS and 0 <= c < COLS:
            layer[idx(r, c)] = PATH
        if 0 <= r + 1 < ROWS and 0 <= c < COLS:
            layer[idx(r + 1, c)] = PATH


def place_vpath(layer, c, r_start, r_end):
    """Place vertical 2-col path from r_start to r_end at cols c and c+1."""
    for r in range(r_start, r_end):
        if 0 <= r < ROWS and 0 <= c < COLS:
            layer[idx(r, c)] = PATH
        if 0 <= r < ROWS and 0 <= c + 1 < COLS:
            layer[idx(r, c + 1)] = PATH


# ---------------------------------------------------------------------------
# Build the map
# ---------------------------------------------------------------------------

def generate():
    below = make_layer()      # grass ground
    below2 = make_layer()     # paths, flowers
    world = make_layer()      # buildings, fences, signs, tree trunks
    world2 = make_layer()     # tree canopy overlap parts (unused extra)
    above = make_layer()      # tree tops (canopy)

    # 1) Fill grass everywhere on below_player
    fill_grass(below)

    # -----------------------------------------------------------------------
    # 2) Forest border - top (rows 0-5), left/right edges, bottom (rows 36-39)
    # -----------------------------------------------------------------------
    # Top dense forest
    tree_positions_top = []
    for r in range(0, 5, 2):
        for c in range(0, COLS - 1, 3):
            tree_positions_top.append((r, c))

    # Left edge trees
    for r in range(6, 36, 3):
        tree_positions_top.append((r, 0))

    # Right edge trees
    for r in range(6, 36, 3):
        tree_positions_top.append((r, COLS - 2))

    # Bottom forest border
    for r in range(36, 39, 2):
        for c in range(0, COLS - 1, 3):
            tree_positions_top.append((r, c))

    for r, c in tree_positions_top:
        place_tree(world, above, r, c)

    # Hedge line along row 6 and row 35 (inner border)
    for c in range(2, COLS - 2):
        world[idx(6, c)] = HEDGE_L if c % 2 == 0 else HEDGE_R
        world[idx(35, c)] = HEDGE_L if c % 2 == 0 else HEDGE_R

    # -----------------------------------------------------------------------
    # 3) Main horizontal road (rows 19-20) spanning the map
    # -----------------------------------------------------------------------
    place_hpath(below2, 19, 2, COLS - 2)

    # -----------------------------------------------------------------------
    # 4) Left residential area (rows 8-17, cols 2-15) - 4 small houses
    # -----------------------------------------------------------------------
    # House positions (top-left corner of each 5x3 house)
    houses_left = [
        (8, 3),    # top-left house
        (8, 10),   # top-right house
        (14, 3),   # bottom-left house
        (14, 10),  # bottom-right house
    ]
    for hr, hc in houses_left:
        place_small_house(world, hr, hc)
        # Mailbox in front of door (2 rows below house, centered on door)
        if hr + 4 < ROWS:
            world[idx(hr + 3, hc + 2)] = MAILBOX

    # Vertical path between house columns (col 8-9)
    place_vpath(below2, 8, 8, 20)

    # Horizontal path connecting houses to main road
    place_hpath(below2, 12, 3, 15)

    # Vertical paths from houses down to main road
    place_vpath(below2, 5, 11, 20)
    place_vpath(below2, 12, 11, 20)

    # -----------------------------------------------------------------------
    # 5) Central park / break room (rows 8-18, cols 16-33)
    # -----------------------------------------------------------------------
    # Scattered trees in the park
    park_trees = [
        (8, 17), (8, 23), (8, 29),
        (12, 19), (12, 25), (12, 31),
        (16, 17), (16, 23), (16, 29),
    ]
    for r, c in park_trees:
        place_tree(world, above, r, c)

    # Flower patches scattered in the park
    flower_spots = [
        (9, 20), (9, 21), (9, 26), (9, 27),
        (11, 18), (11, 22), (11, 28), (11, 32),
        (13, 20), (13, 21), (13, 26), (13, 27),
        (15, 18), (15, 22), (15, 28), (15, 32),
        (17, 20), (17, 21), (17, 26), (17, 27),
    ]
    for r, c in flower_spots:
        if 0 <= r < ROWS and 0 <= c < COLS:
            below2[idx(r, c)] = FLOWER

    # Park paths - cross pattern
    place_hpath(below2, 13, 16, 34)  # horizontal through park middle
    place_vpath(below2, 24, 8, 20)   # vertical through park center

    # Signs at park entrances
    world[idx(13, 16)] = SIGN
    world[idx(13, 33)] = SIGN

    # -----------------------------------------------------------------------
    # 6) Right office area (rows 8-18, cols 34-47) - 2 lab buildings
    # -----------------------------------------------------------------------
    place_lab(world, 9, 36)    # Office 1
    place_lab(world, 15, 36)   # Office 2

    # Signs next to offices
    world[idx(12, 36)] = SIGN
    world[idx(18, 36)] = SIGN

    # Vertical path from offices to main road
    place_vpath(below2, 39, 8, 20)
    place_vpath(below2, 35, 12, 20)

    # Horizontal connector from park to offices
    place_hpath(below2, 10, 34, 48)

    # -----------------------------------------------------------------------
    # 7) Bottom-left: 3 more houses (rows 22-32, cols 2-18)
    # -----------------------------------------------------------------------
    houses_bottom_left = [
        (23, 3),
        (23, 10),
        (28, 3),
    ]
    for hr, hc in houses_bottom_left:
        place_small_house(world, hr, hc)
        if hr + 3 < ROWS:
            world[idx(hr + 3, hc + 2)] = MAILBOX

    # Paths connecting bottom-left houses
    place_vpath(below2, 5, 21, 34)
    place_vpath(below2, 12, 21, 34)
    place_hpath(below2, 26, 3, 15)

    # -----------------------------------------------------------------------
    # 8) Bottom-center: Town square (rows 22-32, cols 18-33)
    # -----------------------------------------------------------------------
    # Open paved area
    for r in range(23, 32):
        for c in range(19, 33):
            below2[idx(r, c)] = PATH

    # Signs around town square
    world[idx(23, 25)] = SIGN
    world[idx(23, 26)] = SIGN

    # Flower decorations around square edges
    for c in range(20, 32):
        below2[idx(22, c)] = FLOWER
        below2[idx(32, c)] = FLOWER
    for r in range(23, 32):
        below2[idx(r, 19)] = FLOWER
        below2[idx(r, 32)] = FLOWER

    # Trees at corners of town square
    square_trees = [(22, 18), (22, 33), (32, 18), (32, 33)]
    for r, c in square_trees:
        place_tree(world, above, r, c)

    # Vertical path from main road to town square
    place_vpath(below2, 24, 19, 24)

    # -----------------------------------------------------------------------
    # 9) Bottom-right: Another large building (rows 22-32, cols 34-47)
    # -----------------------------------------------------------------------
    place_lab(world, 24, 37)   # Community building

    # More trees around it
    br_trees = [(22, 35), (22, 44), (28, 35), (28, 44)]
    for r, c in br_trees:
        place_tree(world, above, r, c)

    # Path from main road down to bottom-right building
    place_vpath(below2, 39, 20, 28)

    # Fence along bottom of bottom area
    for c in range(2, COLS - 2):
        world[idx(34, c)] = FENCE_BOTTOM

    # -----------------------------------------------------------------------
    # 10) Additional connecting paths
    # -----------------------------------------------------------------------
    # Vertical path on left side connecting top and bottom residential
    place_vpath(below2, 3, 7, 34)

    # Horizontal path at bottom connecting all bottom areas
    place_hpath(below2, 31, 2, COLS - 2)

    # -----------------------------------------------------------------------
    # 11) Extra decoration: more scattered trees and flowers
    # -----------------------------------------------------------------------
    extra_trees = [
        (30, 10), (30, 14),
        (25, 44), (30, 44),
        (7, 20), (7, 26), (7, 32),
    ]
    for r, c in extra_trees:
        place_tree(world, above, r, c)

    extra_flowers = [
        (10, 4), (10, 5), (10, 11), (10, 12),
        (25, 5), (25, 6), (25, 12), (25, 13),
        (33, 20), (33, 21), (33, 26), (33, 27),
    ]
    for r, c in extra_flowers:
        if 0 <= r < ROWS and 0 <= c < COLS:
            below2[idx(r, c)] = FLOWER

    # -----------------------------------------------------------------------
    # Build objects layer (spawn points)
    # -----------------------------------------------------------------------
    spawn_points = [
        {"name": "spawn_park_center", "x": 25 * TILE_SIZE, "y": 13 * TILE_SIZE},
        {"name": "spawn_park_north", "x": 24 * TILE_SIZE, "y": 9 * TILE_SIZE},
        {"name": "spawn_park_south", "x": 24 * TILE_SIZE, "y": 17 * TILE_SIZE},
        {"name": "spawn_residential_1", "x": 6 * TILE_SIZE, "y": 12 * TILE_SIZE},
        {"name": "spawn_residential_2", "x": 13 * TILE_SIZE, "y": 12 * TILE_SIZE},
        {"name": "spawn_office_1", "x": 39 * TILE_SIZE, "y": 12 * TILE_SIZE},
        {"name": "spawn_office_2", "x": 39 * TILE_SIZE, "y": 18 * TILE_SIZE},
        {"name": "spawn_main_road_west", "x": 8 * TILE_SIZE, "y": 19 * TILE_SIZE},
        {"name": "spawn_main_road_east", "x": 40 * TILE_SIZE, "y": 19 * TILE_SIZE},
        {"name": "spawn_town_square", "x": 26 * TILE_SIZE, "y": 27 * TILE_SIZE},
        {"name": "spawn_bottom_left", "x": 6 * TILE_SIZE, "y": 27 * TILE_SIZE},
        {"name": "spawn_bottom_right", "x": 40 * TILE_SIZE, "y": 26 * TILE_SIZE},
    ]

    objects = []
    for i, sp in enumerate(spawn_points):
        objects.append({
            "height": 0,
            "id": i + 1,
            "name": sp["name"],
            "point": True,
            "rotation": 0,
            "type": "spawn",
            "visible": True,
            "width": 0,
            "x": sp["x"],
            "y": sp["y"]
        })

    # -----------------------------------------------------------------------
    # Collision tile properties
    # -----------------------------------------------------------------------
    def collision_props(local_ids):
        tiles = []
        for lid in local_ids:
            tiles.append({
                "id": lid,
                "properties": [
                    {
                        "name": "collides",
                        "type": "bool",
                        "value": True
                    }
                ]
            })
        return tiles

    grounds_collision_local = [102, 103, 118, 119, 134, 135]
    world_collision_local = [
        7, 23, 32, 33, 34, 35, 36, 37, 38, 39,
        48, 49, 50, 51, 52, 53, 54,
        64, 65, 66, 67, 68, 69, 70, 72,
        87, 88,
        112, 113, 114, 115, 116,
        128, 129, 130, 131, 132, 136,
        144, 146, 147, 148, 152,
        173, 174, 175, 176, 177, 178, 179, 180,
        189, 190, 191, 192, 193, 194, 195, 196,
        205, 207,
        222, 223, 238, 239,
        243, 244, 245, 246, 254, 255
    ]
    world2_collision_local = [
        1, 6, 32, 33, 48, 49, 64, 65, 80, 81, 96, 97,
        178, 179, 180, 194, 195, 196, 210, 211, 212,
        231, 242, 244, 247
    ]

    # -----------------------------------------------------------------------
    # Assemble the Tiled JSON
    # -----------------------------------------------------------------------
    tiled_map = {
        "compressionlevel": -1,
        "height": ROWS,
        "infinite": False,
        "layers": [
            {
                "data": below,
                "height": ROWS,
                "id": 1,
                "name": "below_player",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": COLS,
                "x": 0,
                "y": 0
            },
            {
                "data": below2,
                "height": ROWS,
                "id": 2,
                "name": "below_player2",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": COLS,
                "x": 0,
                "y": 0
            },
            {
                "data": world,
                "height": ROWS,
                "id": 3,
                "name": "world",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": COLS,
                "x": 0,
                "y": 0
            },
            {
                "data": world2,
                "height": ROWS,
                "id": 4,
                "name": "world2",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": COLS,
                "x": 0,
                "y": 0
            },
            {
                "data": above,
                "height": ROWS,
                "id": 5,
                "name": "above_player",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": COLS,
                "x": 0,
                "y": 0
            },
            {
                "draworder": "topdown",
                "id": 6,
                "name": "objects",
                "objects": objects,
                "opacity": 1,
                "type": "objectgroup",
                "visible": True,
                "x": 0,
                "y": 0
            }
        ],
        "nextlayerid": 7,
        "nextobjectid": len(objects) + 1,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "tiledversion": "1.10.1",
        "tileheight": TILE_SIZE,
        "tilesets": [
            {
                "columns": 16,
                "firstgid": 1,
                "image": "../tilesets/grounds.png",
                "imageheight": 576,
                "imagewidth": 768,
                "margin": 0,
                "name": "grounds",
                "spacing": 0,
                "tilecount": 192,
                "tileheight": TILE_SIZE,
                "tiles": collision_props(grounds_collision_local),
                "tilewidth": TILE_SIZE
            },
            {
                "columns": 16,
                "firstgid": 193,
                "image": "../tilesets/world.png",
                "imageheight": 768,
                "imagewidth": 768,
                "margin": 0,
                "name": "world",
                "spacing": 0,
                "tilecount": 256,
                "tileheight": TILE_SIZE,
                "tiles": collision_props(world_collision_local),
                "tilewidth": TILE_SIZE
            },
            {
                "columns": 16,
                "firstgid": 449,
                "image": "../tilesets/world2.png",
                "imageheight": 768,
                "imagewidth": 768,
                "margin": 0,
                "name": "world2",
                "spacing": 0,
                "tilecount": 256,
                "tileheight": TILE_SIZE,
                "tiles": collision_props(world2_collision_local),
                "tilewidth": TILE_SIZE
            },
            {
                "columns": 28,
                "firstgid": 705,
                "image": "../tilesets/grounds2.png",
                "imageheight": 2400,
                "imagewidth": 1431,
                "margin": 0,
                "name": "grounds2",
                "spacing": 0,
                "tilecount": 1316,
                "tileheight": TILE_SIZE,
                "tilewidth": TILE_SIZE
            }
        ],
        "tilewidth": TILE_SIZE,
        "type": "map",
        "version": "1.10",
        "width": COLS
    }

    return tiled_map


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "webview-ui", "public", "assets", "maps", "agent-town.json"
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    tiled_map = generate()

    # Validate layer sizes
    for layer in tiled_map["layers"]:
        if layer["type"] == "tilelayer":
            assert len(layer["data"]) == TOTAL, (
                f"Layer '{layer['name']}' has {len(layer['data'])} tiles, expected {TOTAL}"
            )

    with open(output_path, "w") as f:
        json.dump(tiled_map, f, indent=2)

    print(f"Generated agent-town.json at {output_path}")
    print(f"  Map size: {COLS}x{ROWS} tiles ({COLS * TILE_SIZE}x{ROWS * TILE_SIZE} px)")
    print(f"  Layers: {len(tiled_map['layers'])}")
    for layer in tiled_map["layers"]:
        ltype = layer["type"]
        if ltype == "tilelayer":
            non_zero = sum(1 for t in layer["data"] if t != 0)
            print(f"    {layer['name']} ({ltype}): {non_zero} non-empty tiles")
        else:
            print(f"    {layer['name']} ({ltype}): {len(layer.get('objects', []))} objects")
    print(f"  Spawn points: {len(tiled_map['layers'][-1]['objects'])}")
