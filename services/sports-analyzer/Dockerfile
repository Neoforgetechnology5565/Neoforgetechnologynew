# Sports analysis service. Build from the REPOSITORY ROOT:
#   docker build -f services/sports-analyzer/Dockerfile -t neoforge-sports .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/sports-analyzer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/sports-analyzer/app ./app
COPY services/sports-analyzer/models ./models
ENV SPORTS_WORK_DIR=/tmp/sports
EXPOSE 8050
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8050"]
