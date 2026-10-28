# Limitations (read before relying on any number)

* **Scale is relative.** Structure from motion recovers shape up to an unknown scale. Distances are model units until you calibrate with a known distance, and then they are only as accurate as that reference and the reconstruction. Angles are scale-invariant and remain valid. Never read model units as metres.
* **Smart-glasses video may carry no depth sensor data, no intrinsics and no metric scale.** None is assumed. The focal length is estimated by bundle adjustment unless the image metadata contains one.
* **Depth maps are learned relative depth**, not measurements. They can be wrong on glass, mirrors, sky, repetitive texture and unusual scenes.
* **The densified cloud and the mesh are approximations.** Each keyframe contributes its own surface from learned depth; surfaces are not reconciled, so seams and slab-like layers appear, and Poisson meshing closes gaps with invented surface. Keyframes whose depth disagrees with the SfM geometry are dropped (reported in the warnings). Do not use them to measure.
* **Failure is normal and reported.** Blur, weak texture, glare, fast turns, little overlap, rolling-shutter wobble and moving objects (cars, people) reduce registration or corrupt geometry. The tool says how many frames registered, the reprojection error and which neighbouring frame pairs are weakly matched, and fails with an explanation when fewer than three frames register.
* **Keyframe limit.** At most 120 keyframes (default 90); a long video is subsampled, which reduces overlap.
* **CPU only; not real-time.** The sample (84 keyframes at 800 px) takes about 4 minutes. Nothing here is real-time or runs on a headset.
* **No loop closure, no IMU/sensor fusion, no global alignment** to a map, no semantic understanding.
* **Not survey-grade.** The mean reprojection error is a consistency measure of the reconstruction, not an accuracy against ground truth; none was measured against ground truth.
* **Hosting.** Reconstruction needs the service; without it the site offers only the precomputed sample and local viewing of imported files.
