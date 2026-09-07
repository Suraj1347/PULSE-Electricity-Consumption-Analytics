FROM python:3.11-slim

RUN pip install --no-cache-dir kafka-python==2.0.2

COPY producer.py /app/producer.py
WORKDIR /app

CMD ["python", "producer.py"]
