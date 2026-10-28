# Testing

| Suite | Command | What it covers |
|---|---|---|
| Service (pytest) | `cd services/roof-analyzer && pytest` | measurement maths (homography, GSD, pitch, units, rejections), geometry on real mask, real-model inference on SpaceNet chips, API validation, jobs, cancel, exports, path safety |
| Parity | `npm run test:roof` | TypeScript engine vs Python on `fixtures/measure-cases.json` (6 parity + 4 rejection cases) |
| UI static | `MODE=static BASE_URL=… node scripts/test-roof-ui.mjs` (`npm run test:roof:ui`) | page with no service: stored sample results, drawing and measuring, units, estimate, exports, phone width |
| UI server | `MODE=server …` with the service and `ROOF_API_URL` | live upload analysis, cancel, errors |

Playwright runs with software WebGL; set `NODE_PATH` to a directory holding `playwright`.
