# PyInstaller spec: builds the standalone processing engine (a folder with the `pgengine` executable). Run from the engine/ folder:  pyinstaller pgengine.spec
from PyInstaller.utils.hooks import collect_all, collect_submodules
datas, binaries, hidden = [], [], ["pgengine.api", "pgengine.pipeline", "uvicorn.logging", "uvicorn.loops.auto", "uvicorn.protocols.http.auto", "uvicorn.protocols.websockets.auto", "uvicorn.lifespan.on"]
for pkg in ("open3d", "pymeshlab", "trimesh", "laspy", "lazrs", "pxr", "scipy", "PIL", "networkx"):
    try:
        d, b, h = collect_all(pkg); datas += d; binaries += b; hidden += h
    except Exception as e:  # optional packages
        print("skipping", pkg, e)
datas += [("../ui/dist", "ui_dist")]
a = Analysis(["run_engine.py"], pathex=["."], binaries=binaries, datas=datas, hiddenimports=hidden, excludes=["tkinter", "matplotlib", "pytest", "IPython"])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="pgengine", console=True)
coll = COLLECT(exe, a.binaries, a.datas, name="pgengine")
