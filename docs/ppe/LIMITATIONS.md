# Limitations (read before relying on any number)

* **Automated visual assessment, not a safety determination.** It does not guarantee safety and is not a substitute for supervision, inspection or any legal duty.
* **A missing detection is not proof of a missing item.** It is reported as a *potential* violation, only from a good view and consistent evidence; anything weaker is *uncertain*. Workers who are small, partly hidden, cut off by the frame, or in a group will often be *uncertain*.
* **No accuracy benchmark.** Nothing was measured against labelled data; do not quote figures for this demo. The PPE model's own accuracy is undocumented. False positives and negatives occur (see `MODEL_AND_LICENSES.md`).
* **Only hard hats and safety vests.** No gloves, goggles, masks, boots or harnesses. Hard-hat colour is not classified; a cap or hood may be mistaken for a hat, and a high-visibility jacket of an unusual colour may not be recognised as a vest.
* **Tracking.** ByteTrack has no appearance model or camera-motion compensation; IDs can switch or split after long occlusion, in crowds or with a moving camera. `Unique worker tracks` is **not a headcount**. IDs are temporary labels: no face recognition, no matching across videos.
* **Workers vs people.** The detector finds "persons"; it cannot know who is a worker.
* **Speed.** Measured on a shared CPU: about 13–21 frames/s (19 frames/s for the stored run) for the 960×540 sample, including the annotated-video encode, depending on machine load. Not a benchmark; not real-time on every machine; no GPU path.
* **Zone.** A rectangle in image space; a worker counts when their feet (bottom centre of the box) are inside. It is not a calibrated floor-plane zone.
* **Sample.** One 65 s indoor clip; it has full-PPE workers and people without a vest, so it shows both outcomes, but it is staged footage, not a factory floor, and says nothing about performance in real plants (lighting, distance, clutter).
* **Hosting.** Uploads need the service running; the site alone shows only the stored sample result.
