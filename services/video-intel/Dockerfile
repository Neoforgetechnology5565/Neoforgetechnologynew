# Video intelligence service (samples 22-24). Build from the REPOSITORY ROOT:
#   docker build -f services/video-intel/Dockerfile -t neoforge-vi .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/video-intel/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/video-intel/app ./app
COPY services/activity-monitor/models/yolox_s.onnx ./models/yolox_s.onnx
COPY public/vi/samples ./samples
ENV VI_DETECTOR_PATH=/srv/models/yolox_s.onnx VI_SAMPLES_DIR=/srv/samples VI_WORK_DIR=/tmp/vi
EXPOSE 8130
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8130"]
