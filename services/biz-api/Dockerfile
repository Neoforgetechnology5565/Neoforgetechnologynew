# Business demo API (CRM/HRM/ERP). Build from the REPOSITORY ROOT:
#   docker build -f services/biz-api/Dockerfile -t neoforge-biz .
# Mount a volume on /data so the SQLite file survives restarts.
FROM python:3.12-slim
WORKDIR /srv
COPY services/biz-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/biz-api/app ./app
ENV BIZ_DB_PATH=/data/biz.db
RUN mkdir -p /data && chown nobody /data
VOLUME /data
EXPOSE 8120
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8120"]
