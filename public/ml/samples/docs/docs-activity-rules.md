# The rules, exactly

Both rules are explicit functions in `services/activity-monitor/app/activity.py`. Each alert lists the measured values and the thresholds they were compared with (“criteria met n/m”). **That count is not a probability or a confidence.**

## Per-person measurements
* **Torso tilt**: angle between the shoulder-midpoint→hip-midpoint line and image vertical (0° upright, 90° horizontal). Needs shoulders and hips with mean visibility ≥ 0.5.
* **Torso length** (px): shoulder-mid to hip-mid distance; the length scale, so thresholds do not depend on resolution.
* **State per sample**: *upright* (tilt ≤ 35°), *lying* (tilt ≥ 60°), otherwise *mid*. When the pose is missing or unreliable the box is used instead: width/height ≥ 1.2 is lying, ≤ 0.8 is upright (the alert says so).

## Possible fall
All of: upright for ≥ 0.6 s (at least 70 % of those samples); then lying within 1.5 s; hips descend ≥ 0.6 torso lengths **or** the box height falls to ≤ 60 % of its upright value; stays lying ≥ 1 s (or the video ends while lying, flagged). Informational: peak descent speed; whether a return to upright was observed. One alert per person per 3 s.
Typical false alarms: deliberately lying down quickly, crouching and sitting abruptly, exercise, bending, children playing, a person who walks out of view as they bend. Typical misses: falls partly hidden or toward/away from the camera, from sitting, slow collapses over more than 1.5 s, overhead cameras.

## Rapid close-contact motion
Two tracked people whose box centres are ≤ 1.2 mean box heights apart for ≥ 1 s, with at least 50 % of those samples showing a wrist moving ≥ 6 torso lengths per second relative to that person's own hip midpoint. It does **not** measure contact, force or intent; dancing, sport, play, hugging and handshakes can qualify. At 5 fps, fast punches are under-sampled.

## How the defaults were chosen, and what that does and does not show
Wrist speed relative to the hips was measured on the bundled pedestrian clip (2,134 samples): median 0.6, 90th percentile 2.6, 99th 5.7, 99.9th 7.6 torso lengths/s. With the speed threshold at 3 the rule produced two to four candidates on people who were only walking; at 6 it produced none. The default 6 therefore bounds false alarms **on walking at this distance and size** and nothing more: there is no footage of real aggression in the project, so the detection rate is unknown. The fall defaults are round numbers set by reasoning about posture, not tuned on any data, and tested only on generated skeleton motions and on real keypoints rotated into a fall (see `TESTING.md`). The *High sensitivity* preset lowers both sets of thresholds to show the review workflow with plentiful false alarms.
