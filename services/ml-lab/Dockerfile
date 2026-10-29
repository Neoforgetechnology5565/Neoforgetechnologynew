# ML lab service. Build from the REPOSITORY ROOT:
#   docker build -f services/ml-lab/Dockerfile -t neoforge-ml .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/ml-lab/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/ml-lab/app ./app
COPY services/ml-lab/models ./models
COPY services/activity-monitor/models /srv/shared-models
COPY public/ml/samples /srv/samples
ENV ML_SHARED_MODELS_DIR=/srv/shared-models ML_SAMPLES_DIR=/srv/samples ML_WORK_DIR=/tmp/ml
EXPOSE 8110
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8110"]
