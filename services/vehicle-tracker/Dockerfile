# Vehicle detection / tracking / counting service. Build from the REPOSITORY ROOT:
#   docker build -f services/vehicle-tracker/Dockerfile -t neoforge-vehicle .
# ffmpeg gives H.264 MP4 output; without it a slower WebM writer is used.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/vehicle-tracker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/vehicle-tracker/app ./app
COPY services/vehicle-tracker/scripts ./scripts
RUN python scripts/fetch_model.py
COPY public/vehicle/samples ./samples
ENV VEHICLE_SAMPLES_DIR=/srv/samples VEHICLE_WORK_DIR=/tmp/vehicle
EXPOSE 8010
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
