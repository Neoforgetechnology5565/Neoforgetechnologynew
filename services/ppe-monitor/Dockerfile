# Worker detection / tracking / PPE monitoring service. Build from the REPOSITORY ROOT:
#   docker build -f services/ppe-monitor/Dockerfile -t neoforge-ppe .
# ffmpeg gives H.264 MP4 output; without it a slower WebM writer is used.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/ppe-monitor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/ppe-monitor/app ./app
COPY services/ppe-monitor/scripts ./scripts
COPY services/ppe-monitor/models ./models
RUN python scripts/fetch_model.py
COPY public/ppe/samples ./samples
ENV PPE_SAMPLES_DIR=/srv/samples PPE_WORK_DIR=/tmp/ppe
EXPOSE 8020
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8020"]
