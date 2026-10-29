# LiDAR service. Build from the REPOSITORY ROOT:
#   docker build -f services/lidar-wires/Dockerfile -t neoforge-lidar .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/lidar-wires/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/lidar-wires/app ./app
COPY public/lidar/samples ./samples
ENV LIDAR_SAMPLES_DIR=/srv/samples
EXPOSE 8070
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8070"]
