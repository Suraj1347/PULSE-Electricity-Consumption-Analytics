"""
PULSE - Kafka Replay Producer
==============================

Replays household_power_consumption.txt into a Kafka topic at an
accelerated, configurable rate so the streaming pipeline always has
live traffic to show, instead of waiting hours for the real 4-year
span to elapse. When it reaches the end of the file it loops back to
the start (LOOP=true) for a continuous demo.

Environment:
    KAFKA_BOOTSTRAP  Kafka bootstrap servers (default: kafka:19092)
    KAFKA_TOPIC      Topic to publish to (default: pulse-readings)
    DATASET_PATH     Path to household_power_consumption.txt
    RATE_PER_SEC     Messages per second (default: 20)
    LOOP             Loop back to the start of the file when done (default: true)
"""

import csv
import json
import os
import sys
import time

from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable

KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "kafka:19092")
KAFKA_TOPIC = os.environ.get("KAFKA_TOPIC", "pulse-readings")
DATASET_PATH = os.environ.get("DATASET_PATH", "/workspace/household_power_consumption.txt")
RATE_PER_SEC = float(os.environ.get("RATE_PER_SEC", "20"))
LOOP = os.environ.get("LOOP", "true").lower() == "true"

FIELDS = [
    "date", "time", "global_active_power", "global_reactive_power",
    "voltage", "global_intensity", "sub_metering_1", "sub_metering_2", "sub_metering_3",
]


def connect(max_tries=30, delay=5):
    for attempt in range(1, max_tries + 1):
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                linger_ms=50,
            )
            print(f"Connected to Kafka at {KAFKA_BOOTSTRAP}", flush=True)
            return producer
        except NoBrokersAvailable:
            print(f"[{attempt}/{max_tries}] Kafka not ready yet, retrying in {delay}s...", flush=True)
            time.sleep(delay)
    print("ERROR: could not connect to Kafka, giving up.", file=sys.stderr, flush=True)
    sys.exit(1)


def row_to_payload(row):
    payload = dict(zip(FIELDS, row))
    payload["timestamp"] = f"{row[0]} {row[1]}"
    payload["produced_at"] = time.time()
    return payload


def main():
    if not os.path.isfile(DATASET_PATH):
        print(f"ERROR: dataset not found at {DATASET_PATH}", file=sys.stderr, flush=True)
        sys.exit(1)

    producer = connect()
    sleep_interval = 1.0 / RATE_PER_SEC if RATE_PER_SEC > 0 else 0
    total_sent = 0
    loop_count = 0

    while True:
        loop_count += 1
        print(f"=== Replay pass {loop_count} (rate={RATE_PER_SEC}/s, loop={LOOP}) ===", flush=True)
        with open(DATASET_PATH, "r", encoding="utf-8") as f:
            reader = csv.reader(f, delimiter=";")
            next(reader, None)  # skip header
            for row in reader:
                if len(row) != len(FIELDS):
                    continue
                producer.send(KAFKA_TOPIC, value=row_to_payload(row))
                total_sent += 1
                if total_sent % 500 == 0:
                    print(f"  sent {total_sent:,} messages (pass {loop_count})", flush=True)
                if sleep_interval:
                    time.sleep(sleep_interval)

        producer.flush()
        if not LOOP:
            break

    print(f"Done. Total messages sent: {total_sent:,}", flush=True)


if __name__ == "__main__":
    main()
