# Activity review service. Build from the REPOSITORY ROOT:
#   docker build -f services/activity-monitor/Dockerfile -t neoforge-activity .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/activity-monitor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/activity-monitor/app ./app
COPY services/activity-monitor/models ./models
ENV ACTIVITY_WORK_DIR=/tmp/activity
EXPOSE 8090
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
