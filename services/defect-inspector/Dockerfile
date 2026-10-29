# Visual inspection service. Build from the REPOSITORY ROOT:
#   docker build -f services/defect-inspector/Dockerfile -t neoforge-defects .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/defect-inspector/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/defect-inspector/app ./app
COPY services/defect-inspector/models ./models
COPY public/defects/samples ./samples
ENV INSPECT_SAMPLES_DIR=/srv/samples INSPECT_WORK_DIR=/tmp/inspect
EXPOSE 8060
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8060"]
