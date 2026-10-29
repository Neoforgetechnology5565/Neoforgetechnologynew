# Limitations

* Not validated on a labelled fall or aggression dataset: sensitivity, specificity and false-alarm rates are unknown. Do not use for monitoring vulnerable people, safety, security, insurance, employment or legal decisions.
* Alerts can only be as good as detection, tracking and pose. People who are small (below about 80 px tall pose is noisy; below 48 px no pose is run), blurred, in poor light, occluded or crowded give unreliable output. In the bundled clip, 69 tracks were created for roughly 8 pedestrians: tracks fragment and identities switch (ByteTrack has no appearance model).
* Falls toward or away from the camera, under overhead cameras, behind furniture, from a chair or bed, or out of view can be missed; lying down on purpose can trigger the fall rule.
* The close-contact rule does not detect violence. It flags fast arm motion near another person.
* Analysis is at a reduced frame rate; very fast motion is under-sampled. Detection and pose run on CPU at about 1.5× real time at 5 fps on 4 vCPUs for this clip (measured: 121 s for 79.5 s of video).
* Processing is not deterministic to the last decimal: multithreaded float arithmetic can change a borderline detection and therefore the numbers of tracks (63 and 69 were seen on identical settings).
* Privacy: the service receives and temporarily stores the uploaded video and derived keypoints; they are deleted when the job expires (default one hour) or when removed. Keypoints and boxes are personal data in many jurisdictions; deploy accordingly.
* Models: YOLOX (COCO) and BlazePose carry the biases of their training data (pose in particular is less reliable for people in wheelchairs, with mobility aids, children and unusual postures).
