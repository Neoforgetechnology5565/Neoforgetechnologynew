# Roof analysis service. Build from the REPOSITORY ROOT:
#   docker build -f services/roof-analyzer/Dockerfile -t neoforge-roof .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/roof-analyzer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/roof-analyzer/app ./app
COPY services/roof-analyzer/models ./models
COPY public/roof/samples ./samples
ENV ROOF_SAMPLES_DIR=/srv/samples ROOF_WORK_DIR=/tmp/roof
EXPOSE 8040
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8040"]
