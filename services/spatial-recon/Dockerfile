# Spatial reconstruction service. Build from the REPOSITORY ROOT:
#   docker build -f services/spatial-recon/Dockerfile -t neoforge-spatial .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/spatial-recon/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/spatial-recon/app ./app
COPY services/spatial-recon/scripts ./scripts
RUN python scripts/fetch_models.py
COPY public/spatial/samples ./samples
ENV SPATIAL_SAMPLES_DIR=/srv/samples SPATIAL_WORK_DIR=/tmp/spatial
EXPOSE 8030
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8030"]
