# Limitations (read before relying on this demo)

* Recorded clips only: no RTSP, no webcam, no streaming ingest, no multi-camera fusion.
* Not real-time; not GPU-accelerated; the server worker needs a self-hosted Node host with ffmpeg (not Vercel).
* Samples are synthetic shapes: a real detector finds nothing in them (expected). Their boxes are reference annotations.
* Small mobile model; accuracy is not benchmarked. Tracker uses geometry only, so identity switches happen in crowds/occlusion, and
  "unique objects" is an estimate, not a head-count.
* Rules use the bottom-centre of the box on a 2-D image. Camera perspective, lens distortion and calibration are not modelled.
* Weapon detection, face recognition, plate reading, behaviour/aggression analysis: not supported.
* Browser inference needs a modern desktop browser; long clips take minutes. Max 180 s upload, 1,500 sampled frames.
* Retention: jobs 24 h, uploaded files 60 min. The in-memory rate limiter is per server instance; use WAF limits in production.
* Demo has no user accounts: job IDs are unguessable random IDs and job tokens authorise changes. Do not upload sensitive footage.

## Privacy and acceptable use
Use fictional, licensed or authorised footage only. In browser mode the video never leaves the device (only box coordinates
are sent). No face recognition or identity matching exists in the code. No credentials of any kind are handled in the frontend.
