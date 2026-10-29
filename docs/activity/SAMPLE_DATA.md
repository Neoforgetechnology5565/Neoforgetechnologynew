# Sample data

| Sample | Source | Licence | Content |
|---|---|---|---|
| `pedestrians-opencv-vtest` (79.5 s, 768×576, 10 fps) | `samples/data/vtest.avi` in the OpenCV repository, re-encoded to H.264 (`public/activity/samples/`) | Distributed in the Apache-2.0 OpenCV repository as a sample file; the repository does not say who recorded it, and no other rights or consents are claimed | Six to eight people walking on a campus path from a fixed elevated camera |

**It contains no falls and no aggression.** Under the default thresholds it should yield no or very few alerts; any it yields are false alarms on ordinary walking. The *High sensitivity* preset produces false alarms deliberately so the alert queue, clip player and review controls can be exercised on real (but wrong) candidates. No clip showing a real fall or fight is bundled because none with a clear redistribution licence was available; to evaluate the rules, process your own footage. Provenance and the “does not demonstrate” list are in `public/activity/samples/manifest.json` and shown in the UI. If you replace the sample, update the manifest.
