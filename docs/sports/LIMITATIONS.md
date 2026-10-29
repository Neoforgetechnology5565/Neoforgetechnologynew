# Limitations

* **Domain:** the detector suits fixed, high-resolution long-shot football footage. Broadcast close-ups, heavy zoom, cuts and low resolution degrade it; the app warns about small or few players and counts camera cuts (tracks are not carried across them).
* **Tracking:** IDs are temporary. Occlusions, similar kits and cuts cause identity switches and fragmented tracks (a match has ~22 players; far more tracks means fragmentation). Nothing here identifies a player.
* **Ball:** tiny and often missing; observed rate is shown. Interpolated positions are labelled; gaps stay empty. Pitch positions of the ball assume it is on the ground (they are wrong in the air).
* **Pitch mapping:** manual; one homography per camera segment; assumes a flat pitch and feet on the ground; the error shown is measured on *your* landmarks only. A few pixels of clicking error become metres for distant players. With a moving camera the chained transform can drift; check positions near the calibration frame against later ones.
* **Statistics:** estimates (smoothed foot positions, 12 m/s plausibility cut, sampling at 5 frames/s by default). Not validated against ground truth; not match-official numbers.
* **Teams:** a jersey-colour grouping; similar kits, shadows and tiny players make it unreliable and the app then says *uncertain*.
* **Events:** only proximity-based possession candidates. No passes, shots, goals, fouls or offsides.
* **Speed:** CPU only. Measured on the 4-vCPU development container, 1920x1080, 5 frames/s sampling: about 3.9 analysed frames/s (≈0.8× real time) for the analysis itself; while the server also encodes browser previews, about 0.2-0.4× real time. A 2-minute clip therefore takes a few minutes. Use a shorter window (From/To), a lower sampling rate or more CPUs.
* **Browser playback:** H.264 MP4 and VP9 WebM previews are produced when `ffmpeg` is installed; without it the browser must be able to play the uploaded file itself.
