"""Fine-tuning script used to produce models/roof_unet_ft.onnx (provenance, not run in CI).

Starts from the MIT-licensed dida roof-task U-Net weights (abhirup-ghosh/rooftop-detection-unet-image-segmentation, models/unet_final.h5), rebuilds the same
Keras architecture, loads the h5 weights layer by layer, and fine-tunes on SpaceNet 2 Vegas and Paris building footprints (CC BY-SA 4.0) with a 60-image
held-out split (docs/roof/heldout-split.json). The paths below are the scratch locations used for the run; adjust them to reproduce.
Needs: tensorflow, tf2onnx, h5py, tifffile, opencv-python-headless, numpy.
"""
import os, re, csv, sys, time, random, json
import numpy as np, cv2, tifffile
os.environ['TF_CPP_MIN_LOG_LEVEL']='2'
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import h5py
R='/tmp/claude-0/sn/'
def stretch(a):
    out=np.zeros(a.shape,'uint8')
    for c in range(3):
        ch=a[...,c].astype('float32'); v=ch[ch>0]
        if v.size<10: continue
        lo,hi=np.percentile(v,(1,99)); out[...,c]=(np.clip((ch-lo)/max(hi-lo,1),0,1)**0.8*255).astype('uint8')
    return out
def masks_for(city,ids):
    pref={'vegas':'AOI_2_Vegas','paris':'AOI_3_Paris'}[city]
    polys={i:[] for i in ids}
    for r in csv.DictReader(open(R+f'{city}_sol.csv')):
        if r['ImageId'] in polys and 'EMPTY' not in r['PolygonWKT_Pix']: polys[r['ImageId']].append(r['PolygonWKT_Pix'])
    return polys
def parse(wkt):
    rings=re.findall(r'\(([^()]+)\)',wkt); out=[]
    for ring in rings:
        pts=[tuple(map(float,p.split()[:2])) for p in ring.split(',')]
        out.append(np.array(pts,np.float32))
    return out
def load_all():
    X,Y,names=[],[],[]
    for city in ('vegas','paris'):
        pref={'vegas':'AOI_2_Vegas','paris':'AOI_3_Paris'}[city]
        ids=[l.strip() for l in open(R+f'{city}_ids.txt')]
        pol=masks_for(city,ids)
        for i in ids:
            f=R+f'data/{city}/{i.split("_")[-1]}.tif'
            if not os.path.exists(f) or os.path.getsize(f)<2_000_000: continue
            a=stretch(tifffile.imread(f)); m=np.zeros(a.shape[:2],np.uint8)
            for w in pol[i]:
                rings=parse(w)
                if rings: cv2.fillPoly(m,[np.round(rings[0]).astype(np.int32)],1)
                for hole in rings[1:]: cv2.fillPoly(m,[np.round(hole).astype(np.int32)],0)
            X.append(cv2.cvtColor(a,cv2.COLOR_RGB2BGR)); Y.append(m); names.append(f'{city}/{i}')
    return X,Y,names
def unet():
    inputs=keras.Input(shape=(None,None,3))
    def cb(x,f):
        x=layers.Conv2D(f,3,activation='relu',padding='same')(x); return layers.Conv2D(f,3,activation='relu',padding='same')(x)
    c1=cb(inputs,64); p1=layers.MaxPooling2D()(c1); c2=cb(p1,128); p2=layers.MaxPooling2D()(c2); c3=cb(p2,256); p3=layers.MaxPooling2D()(c3); c4=cb(p3,512)
    u1=layers.Conv2DTranspose(256,2,strides=2,padding='same')(c4); c5=cb(layers.concatenate([u1,c3]),256)
    u2=layers.Conv2DTranspose(128,2,strides=2,padding='same')(c5); c6=cb(layers.concatenate([u2,c2]),128)
    u3=layers.Conv2DTranspose(64,2,strides=2,padding='same')(c6); c7=cb(layers.concatenate([u3,c1]),64)
    return keras.Model(inputs,layers.Conv2D(1,1,activation='sigmoid')(c7))
def base():
    m=unet(); g=h5py.File('/tmp/claude-0/probe/abh/models/unet_final.h5','r')['model_weights']
    names=[n.decode() if isinstance(n,bytes) else n for n in g.attrs['layer_names']]; wl=[]
    for n in names:
        wn=[x.decode() if isinstance(x,bytes) else x for x in g[n].attrs['weight_names']]
        if wn: wl.append([np.array(g[n][w]) for w in wn])
    for l,w in zip([l for l in m.layers if l.weights],wl): l.set_weights(w)
    return m
def evaluate(m,X,Y,thr=0.5):
    inter=union=pa=pb=0
    for x,y in zip(X,Y):
        h,w=y.shape; H=(h+15)//16*16; W=(w+15)//16*16
        pad=cv2.copyMakeBorder(x,0,H-h,0,W-w,cv2.BORDER_REFLECT)
        p=m.predict(pad[None].astype('float32')/255,verbose=0)[0,:h,:w,0]>thr
        t=y>0; inter+=(p&t).sum(); union+=(p|t).sum(); pa+=p.sum(); pb+=t.sum()
    return dict(iou=float(inter/max(union,1)),f1=float(2*inter/max(pa+pb,1)),pred_frac=float(pa/sum(y.size for y in Y)),true_frac=float(pb/sum(y.size for y in Y)))
if __name__=='__main__':
    X,Y,names=load_all(); print(len(X),'images')
    rng=random.Random(7); idx=list(range(len(X))); rng.shuffle(idx)
    held=[i for i in idx if True][:60]; train=[i for i in idx if i not in held]
    json.dump({'held_out':[names[i] for i in held],'train':[names[i] for i in train]},open('/tmp/claude-0/roofconv/split.json','w'))
    Xh=[X[i] for i in held]; Yh=[Y[i] for i in held]
    m=base()
    steps=int(sys.argv[1]) if len(sys.argv)>1 else 1200; bs=6
    opt=keras.optimizers.Adam(2e-4)
    def dice_bce(y,p):
        bce=keras.losses.binary_crossentropy(y,p); num=2*tf.reduce_sum(y*p)+1; den=tf.reduce_sum(y)+tf.reduce_sum(p)+1
        return tf.reduce_mean(bce)+(1-num/den)
    @tf.function
    def step(x,y):
        with tf.GradientTape() as t:
            p=m(x,training=True); l=dice_bce(y,p)
        g=t.gradient(l,m.trainable_variables); opt.apply_gradients(zip(g,m.trainable_variables)); return l
    def batch():
        xs,ys=[],[]
        for _ in range(bs):
            i=rng.choice(train); x,y=X[i],Y[i]; s=rng.choice([192,192,256])
            r0=rng.randint(0,x.shape[0]-s); c0=rng.randint(0,x.shape[1]-s); xc=x[r0:r0+s,c0:c0+s]; yc=y[r0:r0+s,c0:c0+s]
            if s!=192: xc=cv2.resize(xc,(192,192)); yc=cv2.resize(yc,(192,192),interpolation=cv2.INTER_NEAREST)
            k=rng.randint(0,3); xc=np.rot90(xc,k); yc=np.rot90(yc,k)
            if rng.random()<.5: xc=xc[:,::-1]; yc=yc[:,::-1]
            xc=xc.astype('float32')/255*rng.uniform(.8,1.2); xs.append(np.clip(xc,0,1)); ys.append(yc[...,None].astype('float32'))
        return np.stack(xs),np.stack(ys)
    t0=time.time(); ema=None
    for s in range(1,steps+1):
        x,y=batch(); l=float(step(x,y)); ema=l if ema is None else .98*ema+.02*l
        if s%25==0: print(s,round(ema,4),round(time.time()-t0),'s',flush=True)
        if s%400==0 or s==steps:
            e=evaluate(m,Xh if s==steps else Xh[:30],Yh if s==steps else Yh[:30]); print('held-out @',s,e,flush=True); m.save_weights('/tmp/claude-0/roofconv/ft.weights.h5')
            json.dump({'steps':s,'finetuned':e,'train_images':len(train),'held_out_images':len(held)},open('/tmp/claude-0/roofconv/metrics_ft.json','w'))
    import tf2onnx
    spec=(tf.TensorSpec((1,None,None,3),tf.float32,name='image_bgr_0_1'),)
    tf2onnx.convert.from_keras(m,input_signature=spec,opset=13,output_path='/tmp/claude-0/roofconv/roof_unet_ft.onnx'); print('saved')
