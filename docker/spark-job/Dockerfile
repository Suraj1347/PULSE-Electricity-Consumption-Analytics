# Runs spark_processing.py via spark-submit against the standalone cluster
# defined in docker-compose.yml. Build context is the repo root so the
# script can be copied in.
FROM apache/spark:3.5.3

USER root
RUN pip3 install --no-cache-dir pandas

COPY spark_processing.py /opt/spark/work-dir/spark_processing.py
COPY spark_streaming.py /opt/spark/work-dir/spark_streaming.py
WORKDIR /opt/spark/work-dir
