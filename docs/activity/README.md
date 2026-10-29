# AI Human Activity, Fall & Aggression Review (Computer Vision demo no. 9)

Upload a video, detect and track people, estimate their pose, and review **candidate** fall and rapid-close-contact events. Frontend `src/components/activity/*`, `src/lib/activity/*`; backend `services/activity-monitor/` (FastAPI + ONNX Runtime). Route `/ai-demos/ai-human-activity-fall-aggression-detection/app`. No database, no accounts, no notifications: videos and reviews live in a temporary directory that expires.

> **This is not a safety system.** Alerts come from simple rules, they are fallible (they miss real events and flag harmless ones), every one needs a person to review it, and the rules have not been validated on labelled fall or aggression footage. The tool does not identify people and has no face recognition.

## Workflow
1. **Video**: upload MP4/MOV/WebM/MKV/AVI, or open the bundled pedestrian clip. Nothing is analysed until you press *Process video*.
2. **Settings**: analysed frame rate (default 5 fps), person-detection threshold, pose on/off, rule sensitivity (default or high sensitivity) and every individual threshold.
3. **Processing**: YOLOX-S person detection → ByteTrack tracking → BlazePose per tracked person → rules over the stored tracks. Progress and cancellation are live.
4. **Review**: alert queue (filters by status and type), a clip player with boxes, track ids and pose overlays (each toggleable), timeline markers, the measured evidence behind each alert, and Confirm / Dismiss / Uncertain with a note. “Confirm” records your judgement only; nothing is sent anywhere.
5. **Tune**: change thresholds and *Apply thresholds only*; the rules are re-run on the stored detections (no video processing). Replacing reviewed alerts asks for confirmation.
6. **Export**: alerts CSV/JSON (with statuses and notes), annotated MP4 of the whole video or of one alert.

## What is real
Every number in the summary is counted from the run (analysed frames, person observations, tracks, pose runs, alerts by type and status, detection/pose seconds). Alerts only exist if a rule fired on real tracks; zero alerts is reported as zero.

## What it does not do
Fall prevention or detection guarantees; emergency calls or notifications; identification of anyone; recognition of intent, weapons or injuries; detection of events outside the camera's view; certified performance of any kind. See `LIMITATIONS.md`.

See also `ARCHITECTURE.md`, `API.md`, `RULES.md`, `SAMPLE_DATA.md`, `TESTING.md`, `DEPLOYMENT.md`.
