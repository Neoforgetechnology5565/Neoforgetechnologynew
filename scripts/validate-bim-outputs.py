#!/usr/bin/env python3
"""Independent validation of exported files with third-party tools (dev-only): ifcopenshell (IFC schema + express rules), ezdxf (DXF audit), pygltflib-free GLB structure check.
Usage: python3 scripts/validate-bim-outputs.py file.ifc|file.dxf|file.glb ..."""
import sys, json, struct, logging
def ifc(path):
    import ifcopenshell, ifcopenshell.validate
    f = ifcopenshell.open(path); msgs = []
    class H(logging.Handler):
        def emit(self, r): msgs.append(r.getMessage())
    lg = logging.getLogger("ifcv"); lg.setLevel(logging.WARNING); lg.addHandler(H()); ifcopenshell.validate.validate(f, lg, express_rules=True)
    print(f"IFC {f.schema}: walls={len(f.by_type('IfcWall'))} doors={len(f.by_type('IfcDoor'))} windows={len(f.by_type('IfcWindow'))} spaces={len(f.by_type('IfcSpace'))} validation_messages={len(msgs)}")
    for m in msgs[:10]: print("  ", m[:240])
    return len(msgs) == 0
def dxf(path):
    import ezdxf
    d = ezdxf.readfile(path); a = d.audit(); print(f"DXF {d.dxfversion}: entities={len(d.modelspace())} audit_errors={len(a.errors)}"); return len(a.errors) == 0
def glb(path):
    b = open(path, "rb").read(); magic, ver, length = struct.unpack("<III", b[:12]); assert magic == 0x46546C67 and ver == 2 and length == len(b), "bad header"
    jl, jt = struct.unpack("<II", b[12:20]); j = json.loads(b[20:20 + jl]); off = 20 + jl; bl, bt = struct.unpack("<II", b[off:off + 8]); assert jt == 0x4E4F534A and bt == 0x004E4942
    assert j["buffers"][0]["byteLength"] <= bl
    for a in j["accessors"]:
        v = j["bufferViews"][a["bufferView"]]; assert v["byteOffset"] + v["byteLength"] <= bl, "view out of range"
    print(f"GLB: nodes={len(j['nodes'])} meshes={len(j['meshes'])} accessors={len(j['accessors'])} bin={bl}"); return True
ok = True
for p in sys.argv[1:]:
    ok &= {"ifc": ifc, "dxf": dxf, "glb": glb}[p.rsplit(".", 1)[-1].lower()](p)
sys.exit(0 if ok else 1)
