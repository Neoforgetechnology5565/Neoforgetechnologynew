# Testing

| Suite | Command | Covers |
|---|---|---|
| Service unit + API | `cd services/sports-analyzer && pytest` | landmark catalogue and homography (exact recovery, noise, outliers, collinear/duplicate/too-few rejection), statistics (known speeds, jitter, jumps, gaps, zones, heatmap), ball linking and gap filling, team clustering (clear/similar/user colours), upload validation (empty, wrong bytes, damaged, oversize, parameters), a full job on a decodable video that contains no players (reports zero honestly and never fabricates pitch data), calibration flow and every error, frame and Range video endpoints, cancel, queue limit, failure without leaking paths |
| Real footage | `SPORTS_TEST_VIDEO=clip.mp4 pytest -m slow` | real detections, tracks and ball observations on a football clip |
| Heatmap parity | `npm run test:sports` | TypeScript heatmap equals the Python one on 5 shared cases; filters never use unmapped positions |
| Browser, no service | `MODE=static BASE_URL=… node scripts/test-sports-ui.mjs` | honest offline state, no invented results, responsive |
| Browser, live | `MODE=server BASE_URL=… VIDEO=clip.mp4 node scripts/test-sports-ui.mjs` | upload validation, real processing with progress, overlay drawn from detector output and synced with the video, timeline seek, statistics before/after calibration, calibration on a real frame and its errors, heatmaps (single, comparison, range filter, insufficient-data warning), zones, exports equal to what is shown, cancel, phone/tablet widths |

The live test and the slow test were run on a real clip (ISSIA-CNR camera 5, local only; the calibration landmark pixels in `test-sports-ui.mjs` describe that clip's frame at 20 s — pass `CAL='[["id",x,y],…]'` for another clip).
