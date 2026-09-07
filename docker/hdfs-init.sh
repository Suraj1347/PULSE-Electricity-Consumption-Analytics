#!/bin/bash
set -e

DATASET=/workspace/household_power_consumption.txt
if [ ! -f "$DATASET" ]; then
  echo "ERROR: $DATASET not found. Place household_power_consumption.txt in the project root first." >&2
  exit 1
fi

echo "Waiting for namenode..."
for i in $(seq 1 30); do
  hdfs dfs -ls / >/dev/null 2>&1 && break
  echo "  not ready yet ($i/30)..."
  sleep 5
done

hdfs dfs -mkdir -p /pulse/raw /pulse/output
echo "Uploading dataset..."
hdfs dfs -put -f "$DATASET" /pulse/raw/household_power_consumption.txt
echo "Contents of /pulse:"
hdfs dfs -ls -R /pulse
