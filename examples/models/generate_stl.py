"""Generates a couple of tiny binary STL test models (no external deps)."""
import struct

def write_stl(path, triangles):
    with open(path, "wb") as f:
        f.write(b"\x00" * 80)
        f.write(struct.pack("<I", len(triangles)))
        for tri in triangles:
            normal = face_normal(tri)
            f.write(struct.pack("<3f", *normal))
            for v in tri:
                f.write(struct.pack("<3f", *v))
            f.write(struct.pack("<H", 0))

def face_normal(tri):
    ax, ay, az = tri[0]
    bx, by, bz = tri[1]
    cx, cy, cz = tri[2]
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    length = (nx ** 2 + ny ** 2 + nz ** 2) ** 0.5 or 1
    return (nx / length, ny / length, nz / length)

def cube_triangles(size=1.0):
    s = size / 2
    verts = {
        "lbb": (-s, -s, -s), "rbb": (s, -s, -s), "rtb": (s, s, -s), "ltb": (-s, s, -s),
        "lbf": (-s, -s, s), "rbf": (s, -s, s), "rtf": (s, s, s), "ltf": (-s, s, s),
    }
    faces = [
        ("lbb", "rbb", "rtb"), ("lbb", "rtb", "ltb"),  # back
        ("lbf", "rtf", "rbf"), ("lbf", "ltf", "rtf"),  # front
        ("lbb", "ltb", "ltf"), ("lbb", "ltf", "lbf"),  # left
        ("rbb", "rtf", "rtb"), ("rbb", "rbf", "rtf"),  # right
        ("ltb", "rtb", "rtf"), ("ltb", "rtf", "ltf"),  # top
        ("lbb", "lbf", "rbf"), ("lbb", "rbf", "rbb"),  # bottom
    ]
    return [tuple(verts[k] for k in face) for face in faces]

def octahedron_triangles(size=1.0):
    s = size * 0.75
    top = (0, s, 0)
    bottom = (0, -s, 0)
    ring = [(s, 0, 0), (0, 0, s), (-s, 0, 0), (0, 0, -s)]
    tris = []
    for i in range(4):
        a = ring[i]
        b = ring[(i + 1) % 4]
        tris.append((top, a, b))
        tris.append((bottom, b, a))
    return tris

write_stl("cube.stl", cube_triangles(1.6))
write_stl("octahedron.stl", octahedron_triangles(1.6))
print("done")
