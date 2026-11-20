// PhotoMesh Studio desktop shell (Tauri 2).
// 1. starts the Python processing engine (the PyInstaller-built `pgengine` executable shipped next to this app, or `python -m pgengine` in development),
// 2. waits until http://127.0.0.1:<port>/api/health answers,
// 3. opens the main window on that address, and stops the engine when the window closes.
// The engine serves the built React UI itself, so the window is a thin shell around the same page that works in a browser.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Engine(Mutex<Option<Child>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0").and_then(|l| l.local_addr()).map(|a| a.port()).unwrap_or(8765)
}

fn engine_command(resource_dir: Option<PathBuf>, port: u16) -> Command {
    // Packaged app: <resources>/engine-dist/pgengine(.exe). Development: PGS_PYTHON (default "python") -m pgengine from ../engine.
    let exe = if cfg!(windows) { "pgengine.exe" } else { "pgengine" };
    if let Some(dir) = resource_dir {
        let p = dir.join("engine-dist").join(exe);
        if p.exists() {
            let mut c = Command::new(p);
            c.args(["--no-open", "--port", &port.to_string()]);
            return c;
        }
    }
    let py = std::env::var("PGS_PYTHON").unwrap_or_else(|_| "python".into());
    let mut c = Command::new(py);
    c.args(["-m", "pgengine", "--no-open", "--port", &port.to_string()]).current_dir("../engine");
    c
}

fn healthy(port: u16) -> bool {
    if let Ok(mut s) = TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().unwrap(), Duration::from_millis(300)) {
        let _ = s.set_read_timeout(Some(Duration::from_millis(800)));
        let _ = s.write_all(b"GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n");
        let mut buf = String::new();
        let _ = s.read_to_string(&mut buf);
        return buf.contains("\"ok\":true");
    }
    false
}

fn main() {
    tauri::Builder::default()
        .manage(Engine(Mutex::new(None)))
        .setup(|app| {
            let port = free_port();
            let child = engine_command(app.path().resource_dir().ok(), port)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("Could not start the processing engine: {e}. Install the engine (see docs) or build the packaged version."))?;
            *app.state::<Engine>().0.lock().unwrap() = Some(child);
            let started = Instant::now();
            while !healthy(port) {
                if started.elapsed() > Duration::from_secs(60) {
                    return Err("The processing engine did not start within 60 seconds.".into());
                }
                std::thread::sleep(Duration::from_millis(250));
            }
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(format!("http://127.0.0.1:{port}/").parse().unwrap()))
                .title("PhotoMesh Studio")
                .inner_size(1500.0, 950.0)
                .min_inner_size(1100.0, 700.0)
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(mut c) = window.app_handle().state::<Engine>().0.lock().unwrap().take() {
                    let _ = c.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running PhotoMesh Studio");
}
