# Demos 27 and 28: 3D point-cloud demonstrations (browser, generated data)

Both run entirely in the browser with three.js and Web Workers. Both use **generated data** and **no neural networks**. Accuracy figures apply to the generated data only.

## Demo 27: 3D human pose estimation and motion analysis
Route `/ai-demos/ai-3d-human-pose-motion/app` (short link `/human-pose-3d-demo`). Code: `src/lib/pose3d/`, `src/components/pose3d/PoseApp.tsx`.
- **Data:** six motions (walking, squat, jumping jacks, vertical jump, kick, two people), generated from a 16-joint skeleton with capsule surface sampling, sensor noise, and either a multi-view rig or a single depth camera (back-facing points removed).
- **Processing:** floor removal, clustering to find people (a pillar and a box are rejected), tracking with stable IDs, articulated closest-capsule skeleton fitting, joint angles, symmetry, range of motion, speed, trajectories, rule-based motion class.
- **Accuracy:** mean joint error against the generator's skeleton (centimetres), shown per joint.
- **Tests:** `npm run test:pose3d`, `npm run test:pose3d:ui`.

## Demo 28: 3D point-cloud segmentation and scene understanding
Route `/ai-demos/ai-3d-scene-segmentation/app` (short link `/scene-segmentation-3d-demo`). Code: `src/lib/scene3d/`, `src/components/scene3d/SceneApp.tsx`.
- **Data:** five scenes (office, living room, industrial hall, warehouse, outdoor street) built from boxes and cylinders, with reference class and instance labels.
- **Computed segmentation:** surface normals, height histogram for floor/ceiling, RANSAC wall planes on the outer boundary, colour and size rules for doors and windows, connected components for objects, geometric rules for table/chair/cabinet/vehicle/tree. Scored against the reference labels (point accuracy, mean IoU, instance matching at IoU 0.5, confusion matrix).
- **Measured on the generated scenes (`npm run test:scene3d`):** point accuracy about 94% (office), 92% (living), 87% (industrial), 78% (warehouse), 98% (outdoor). Known misses: racks and some workbenches are labelled "other" or merged, and the TV cabinet in the living room.
- **UI:** reference or computed labels, colour by class / instance / original colour, per-class toggles and colour pickers, hover highlight, click inspector (category, ID, point count, bounding box, dimensions, centre, confidence), hide/isolate/reset, bounding boxes, point size, scene analytics and spatial relationships.
- **Not implemented:** loading your own point clouds, learned models.
- **Tests:** `npm run test:scene3d`, `npm run test:scene3d:ui`.
