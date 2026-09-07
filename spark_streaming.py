"""
PULSE - Kafka -> Spark Structured Streaming -> Live Dashboard Feed
====================================================================

Consumes the replayed readings from Kafka (see docker/kafka-producer),
maintains a rolling in-memory window of the most recent readings, and
writes a small JSON snapshot on every micro-batch for the frontend to
poll (see src/hooks/useLiveStream.ts).

Usage (inside the spark-streaming container):
    spark-submit --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.3 spark_streaming.py

Environment:
    KAFKA_BOOTSTRAP  Kafka bootstrap servers (default: kafka:19092)
    KAFKA_TOPIC      Topic to subscribe to (default: pulse-readings)
    LIVE_OUT_PATH    Where to write the live JSON snapshot
    BUFFER_SIZE      How many recent readings to keep for the mini chart
    TRIGGER_SECONDS  Micro-batch trigger interval
"""

import json
import os
import time
from collections import deque

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType

KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "kafka:19092")
KAFKA_TOPIC = os.environ.get("KAFKA_TOPIC", "pulse-readings")
LIVE_OUT_PATH = os.environ.get("LIVE_OUT_PATH", "live_out/live_stream.json")
BUFFER_SIZE = int(os.environ.get("BUFFER_SIZE", "60"))
TRIGGER_SECONDS = os.environ.get("TRIGGER_SECONDS", "2")

schema = StructType([
    StructField("date", StringType(), True),
    StructField("time", StringType(), True),
    StructField("global_active_power", StringType(), True),
    StructField("global_reactive_power", StringType(), True),
    StructField("voltage", StringType(), True),
    StructField("global_intensity", StringType(), True),
    StructField("sub_metering_1", StringType(), True),
    StructField("sub_metering_2", StringType(), True),
    StructField("sub_metering_3", StringType(), True),
    StructField("timestamp", StringType(), True),
    StructField("produced_at", DoubleType(), True),
])

print("=" * 60)
print("PULSE — KAFKA STREAMING REPLAY (Spark Structured Streaming)")
print("=" * 60)
print(f"Kafka bootstrap : {KAFKA_BOOTSTRAP}")
print(f"Topic           : {KAFKA_TOPIC}")
print(f"Live output     : {LIVE_OUT_PATH}")

spark = (
    SparkSession.builder
    .appName("PULSE-StreamingReplay")
    .config("spark.sql.shuffle.partitions", "2")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("WARN")

raw = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP)
    .option("subscribe", KAFKA_TOPIC)
    .option("startingOffsets", "latest")
    .option("failOnDataLoss", "false")
    .load()
)

parsed = raw.select(
    F.from_json(F.col("value").cast("string"), schema).alias("d")
).select("d.*")

buffer = deque(maxlen=BUFFER_SIZE)
os.makedirs(os.path.dirname(LIVE_OUT_PATH) or ".", exist_ok=True)


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def write_batch(batch_df, batch_id):
    rows = [r.asDict() for r in batch_df.collect()]
    new_count = 0
    for r in rows:
        power = to_float(r.get("global_active_power"))
        if power is None:
            continue  # matches spark_processing.py's is_complete filter
        buffer.append({
            "timestamp": r.get("timestamp"),
            "global_active_power": power,
            "voltage": to_float(r.get("voltage")),
            "global_intensity": to_float(r.get("global_intensity")),
            "sub_metering_1": to_float(r.get("sub_metering_1")) or 0.0,
            "sub_metering_2": to_float(r.get("sub_metering_2")) or 0.0,
            "sub_metering_3": to_float(r.get("sub_metering_3")) or 0.0,
            "produced_at": r.get("produced_at"),
            "consumed_at": time.time(),
        })
        new_count += 1

    if not buffer:
        print(f"[batch {batch_id}] no readings yet", flush=True)
        return

    values = [b["global_active_power"] for b in buffer]
    payload = {
        "updated_at": time.time(),
        "batch_id": batch_id,
        "new_in_batch": new_count,
        "buffer_size": len(buffer),
        "latest": buffer[-1],
        "avg_power_kw": round(sum(values) / len(values), 4),
        "peak_power_kw": round(max(values), 4),
        "min_power_kw": round(min(values), 4),
        "recent": list(buffer),
    }

    tmp_path = LIVE_OUT_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    os.replace(tmp_path, LIVE_OUT_PATH)

    print(f"[batch {batch_id}] +{new_count} readings, buffer={len(buffer)}, avg={payload['avg_power_kw']} kW", flush=True)


query = (
    parsed.writeStream
    .foreachBatch(write_batch)
    .outputMode("append")
    .trigger(processingTime=f"{TRIGGER_SECONDS} seconds")
    .start()
)

query.awaitTermination()
