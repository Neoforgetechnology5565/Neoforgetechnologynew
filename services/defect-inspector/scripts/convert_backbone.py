"""Convert the Keras-applications ResNet-50 (ImageNet) to models/resnet50_l23.onnx with two outputs: conv3_block4_out (stride 8) and conv4_block6_out (stride 16).

Weights: https://storage.googleapis.com/tensorflow/keras-applications/resnet/resnet50_weights_tf_dim_ordering_tf_kernels_notop.h5
(SHA-256 66c8b43daff3fcc15bc4f30e3d2a167e21a14d9c9598a5394e5516471f4af504; ResNet-50 by He et al., weights ported from the original MSRA release (MIT)).
Needs tensorflow, keras and tf2onnx (not required at run time). Usage: python scripts/convert_backbone.py <weights.h5> <out.onnx>
"""
import sys
import os; os.environ["TF_CPP_MIN_LOG_LEVEL"]="3"
import numpy as np, tensorflow as tf, keras, tf2onnx
from keras.applications import ResNet50
m = ResNet50(weights=sys.argv[1], include_top=False, input_shape=(None, None, 3))
fe = keras.Model(m.input, [m.get_layer("conv3_block4_out").output, m.get_layer("conv4_block6_out").output])
spec = (tf.TensorSpec((1, None, None, 3), tf.float32, name="input"),)
@tf.function(input_signature=spec)
def f(x): return fe(x)
mp, _ = tf2onnx.convert.from_function(f, input_signature=spec, opset=13, output_path=sys.argv[2])
x = np.random.rand(1, 320, 320, 3).astype(np.float32) * 255
ref = fe.predict(x, verbose=0)
import onnxruntime as ort
s = ort.InferenceSession(sys.argv[2]); out = s.run(None, {"input": x})
print([o.shape for o in out], [float(np.abs(a-b).max()) for a, b in zip(ref, out)])
