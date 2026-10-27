# Testing

| Suite | Command | Needs |
|---|---|---|
| Geometry / sizing / mesh (38 tests) | `npm run test:foot` | nothing |
| API integration (15 tests) | `npm run test:foot:api` | dev server + Firestore (emulator OK) |
| Browser UI (Playwright, 13 tests) | `NODE_PATH=<playwright dir> npm run test:foot:ui` | same + Chromium |

## What the unit tests prove (and don't)
They render **synthetic** scenes: a sheet of paper and a parametric foot outline of *known* size, through a pinhole camera with tilt/yaw/roll, noise, blur, different camera heights, A4/Letter, offsets, rotated frames, and a foot silhouette 25 mm above the sheet. Recovered length/width are within 3–5 mm in every case; scale (px/mm), A4-vs-Letter detection, left/right, 6 mm left/right difference, manual-corner equivalence, refusals (no paper, tiny image, white-on-white "sock", foot off the sheet, dark, blurry, strong tilt), size rules (EU/UK/US M/US W, allowance monotonicity, large feet), width class and OBJ units are covered.
**This validates the geometry code. It is not evidence of accuracy on real feet.** A flat (zero-height) synthetic silhouette is *under-read* by the parallax correction (a test documents this), which shows the correction depends on its assumed 25 mm height.

## Integration
`test-foot-api.mjs` runs create → upload → validate → measure → manual-correct → process → results → recommend → report → phone-token capture → history → delete, plus negative cases (wrong key, cross-origin, non-image, tiny file, bad side, phone token used for owner actions, expired/unknown token, bad OBJ).

## Browser tests – what is real and what is mocked
- **Real:** the UI, uploads, manual corner dragging, 3D viewer (software WebGL), downloads, history, delete, mobile viewport (390 px) layout.
- **Mocked/faked:** the camera is Chromium's *fake device* fed an MJPEG made from a synthetic photo (`--use-file-for-fake-video-capture`); permission-denied is simulated by overriding `getUserMedia`.
- **Not performed:** testing on a physical iOS/Android phone, real camera autofocus/exposure, measurement of real feet against a reference scanner or calipers, PWA install flow, offline behaviour, load testing, Georgia font rendering (the sandbox lacks Georgia; only the computed `font-family` is verified).
Before claiming real-world accuracy, run a validation study: ≥30 feet, caliper/scanner ground truth, several phones.
