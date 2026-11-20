import os, socket, subprocess, sys, tempfile, time
import httpx, pytest

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="session")
def server():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); home = tempfile.mkdtemp(prefix="pgs-test-")
    env = {**os.environ, "PGS_HOME": home, "PYTHONPATH": ENGINE}
    p = subprocess.Popen([sys.executable, "-m", "pgengine", "--port", str(port), "--no-open"], env=env, cwd=ENGINE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            if httpx.get(base + "/api/health", timeout=1).status_code == 200: break
        except Exception: time.sleep(0.3)
    else: p.kill(); raise RuntimeError("engine did not start")
    yield base
    p.terminate()


@pytest.fixture()
def client(server):
    with httpx.Client(base_url=server, timeout=600) as c: yield c
