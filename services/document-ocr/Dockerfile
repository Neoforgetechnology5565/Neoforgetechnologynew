# Document intelligence service. Build from the REPOSITORY ROOT:
#   docker build -f services/document-ocr/Dockerfile -t neoforge-documents .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/document-ocr/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt     # the OCR models ship inside the rapidocr-onnxruntime wheel: nothing is downloaded at run time
COPY services/document-ocr/app ./app
ENV DOCS_WORK_DIR=/tmp/documents
EXPOSE 8100
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
