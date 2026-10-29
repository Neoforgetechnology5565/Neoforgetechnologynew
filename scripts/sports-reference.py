import sys, json
sys.path.insert(0,'.')
from pathlib import Path
import cv2, numpy as np
from app.footandball import FootAndBall
from app.media import probe_video
from app.pipeline import JobParams, Progress, analyse, build_results
fb=FootAndBall(Path('models/footandball.onnx'))
vp=Path('/tmp/claude-0/samp/football-demo.mp4'); info=probe_video(vp, 10**8, 10**9); print(info)
p=JobParams(sample_fps=5, player_conf=0.5, ball_conf=0.3)
an=analyse(vp,info,p,fb,Progress(),lambda:False,1000)
res=build_results(an,None)
s=res['summary']; print({k:s[k] for k in ['samples_analysed','player_detections','tracks_found','tracks_kept','players_per_sample','ball','motion','median_player_height_px']})
fr=res['frames']; print(len(fr),[len(f['p']) for f in fr][:12]); 
json.dump({'frames':[{'t':f['t'],'p':f['p'],'b':f['b']} for f in fr],'summary':s,'teams':res['teams']}, open('/tmp/claude-0/sportsref.json','w'))
print(res['teams'])
