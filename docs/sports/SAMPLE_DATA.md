# Sample data

**No match video is bundled.** The requirement was legally usable football footage with players, pitch and ball. In the build environment, hosts that carry openly licensed football video (Wikimedia Commons, Hugging Face, Zenodo, Internet Archive, stock-video sites) were not reachable, and the football clips that were reachable (research datasets, clips inside open-source analytics repositories) have no licence that allows redistribution. Bundling them would have been unlawful, so none is bundled, and nothing is shown in its place: the UI says so and offers upload.

Candidates worth adding when network access or a licence is available (verify the terms on the dataset page before redistributing):
* **SoccerTrack v2** (panoramic full-pitch recordings of university matches; stated CC BY 4.0). 4K panoramas are outside the detector's training domain, so test before relying on them.
* A clip you shot or have written permission to publish.

Adding one: `python services/sports-analyzer/scripts/add_sample.py clip.mp4 --id my-match --title … --description … --licence … --source … --attribution …` (H.264 MP4, ≤ 60 MB). It copies the clip to `public/sports/samples/`, records licence, source and attribution in `manifest.json`, and the UI lists it with those credits. Selecting a sample runs the **same pipeline** as an upload; there are no precomputed results in this demo.
