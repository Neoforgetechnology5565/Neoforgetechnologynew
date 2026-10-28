# Architecture

```
browser (Next.js page) ── HTTPS ──> FastAPI service (services/ppe-monitor)
   upload / sample                      POST /api/detect/video → job (thread pool, bounded)
   live frames polling  <───────────    per frame: YOLOX person ─> ByteTrack ─> PPE SSD per worker crop
   canvas overlay, stats                      ─> association rules ─> assessment (smoothed per track)
                                              └> frames.jsonl (streamed, byte-offset index) + annotated MP4/WebM (ffmpeg pipe)
```
* **Frames are streamed** from OpenCV, results appended to `frames.jsonl` and flushed per frame, so the browser sees results while the job runs and memory does not grow with video length. Jobs live in a temp directory and are deleted after a TTL, on delete, and on service start.
* **One record per frame** drives everything shown: the overlay, the statistics panel and the CSV/JSON export read the same record at the playhead (`frameAt`), so annotations always match the displayed frame. Current-frame values (`workers_visible`, `hard_hats_detected`, …) are kept separate from cumulative ones (`unique_worker_tracks`, `detection_instances_processed`, …).
* **PPE stage.** For each tracked person the frame is cropped (8 % padding), resized to 224×224 and passed to the SSD. Boxes are mapped back to frame coordinates, filtered by position (hat centre in the upper part of the worker box, vest centre on the torso and of plausible size), de-duplicated and given to exactly one worker.
* **Assessment.** Per worker and per required item a state: `detected`, `not_detected`, `uncertain`. For video, evidence is smoothed over the last 30 frames of the track (strong detection = 1, weak = ½, absent from a good view = 0; absence from a poor view is not recorded). `detected` needs ≥ 50 % and ≥ 5 observations, `not_detected` needs ≤ 12 % and ≥ 5 observations. Poor views (worker < 96 px tall, low person confidence, head cut off by the frame edge, overlapping another worker) never add evidence of absence, and an unconfirmed track is never flagged; a conclusion reached earlier is kept through a brief poor view and the reasons say so. For a single image there is no smoothing: a poor view gives "uncertain".
* **No stored site data.** The site hosts the page and the stored sample result; the service holds only temporary job files.
* **Without the service** the page runs read-only on the stored result of a real run on the bundled sample; uploads are disabled and the page says so. (A browser engine like the one in the vehicle demo is not offered: the PPE model is a Caffe network that OpenCV 4 loads natively; converting it for ONNX Runtime Web was not attempted.)
