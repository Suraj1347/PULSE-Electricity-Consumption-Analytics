"""
PULSE — Apache Spark Processing Script (Stage 5A)
==================================================

UCI Individual Household Electric Power Consumption Dataset
Source: https://archive.ics.uci.edu/ml/datasets/individual+household+electric+power+consumption

This script:
1. Reads the raw dataset with an explicit schema
2. Marks complete/incomplete rows (data quality)
3. Computes seven analytics aggregations (including anomaly detection and fingerprint)
4. Writes results to CSV/JSON for later frontend connection

Usage:
    python spark_processing.py

Environment:
    - PySpark 4.2.0 (local mode)
    - Java 21 (Eclipse Temurin)
    - Input: household_power_consumption.txt (126.80 MB, 2,075,259 rows)
    - Output: results/ directory
"""

import os
import sys
from pyspark.sql import SparkSession
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, BooleanType
)
from pyspark.sql import functions as F
from pyspark.sql.window import Window

# ============================================================
# CONFIGURATION
# ============================================================

INPUT_FILE = "hdfs:///pulse/raw/household_power_consumption.txt"
RESULTS_DIR = "results"
HDFS_OUTPUT = "hdfs:///pulse/output"

# ============================================================
# STEP 1: CREATE SPARK SESSION
# ============================================================

print("=" * 60)
print("PULSE — SPARK PROCESSING (Stage 5A)")
print("=" * 60)

spark = (
    SparkSession.builder
    .master("local[*]")
    .appName("PULSE-EnergyProcessing")
    .config("spark.sql.shuffle.partitions", "8")
    .config("spark.driver.memory", "2g")
    .config("spark.hadoop.fs.defaultFS", "hdfs://localhost:9000")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")
print(f"\nSpark version : {spark.version}")
print(f"Application   : {spark.sparkContext.appName}")

# ============================================================
# STEP 2: DEFINE SCHEMA
# ============================================================

# Explicit schema matches the 9 semicolon-delimited columns
schema = StructType([
    StructField("Date",                  StringType(), True),
    StructField("Time",                  StringType(), True),
    StructField("Global_active_power",   DoubleType(), True),
    StructField("Global_reactive_power", DoubleType(), True),
    StructField("Voltage",               DoubleType(), True),
    StructField("Global_intensity",      DoubleType(), True),
    StructField("Sub_metering_1",        DoubleType(), True),
    StructField("Sub_metering_2",        DoubleType(), True),
    StructField("Sub_metering_3",        DoubleType(), True),
])

print(f"\nSchema defined: {len(schema.fields)} fields")
for field in schema.fields:
    print(f"  {field.name:30s} {field.dataType.simpleString()}")

# ============================================================
# STEP 3: READ RAW DATA
# ============================================================

print(f"\nReading: {INPUT_FILE}")

raw_df = (
    spark.read
    .option("sep", ";")
    .option("header", "true")
    .option("nullValue", "?")
    .schema(schema)
    .csv(INPUT_FILE)
)

# Force materialization to count rows
raw_count = raw_df.count()

print(f"Raw row count: {raw_count:,}")

# ============================================================
# STEP 4: COMBINE DATE + TIME INTO TIMESTAMP
# ============================================================

# Date format in file: DD/MM/YYYY
# Time format in file: HH:MM:SS
# Combine into a proper Spark timestamp

df = raw_df.withColumn(
    "timestamp",
    F.try_to_timestamp(
        F.concat_ws(" ", F.col("Date"), F.col("Time")),
        F.lit("d/M/yyyy H:m:s")
    )
)

# ============================================================
# STEP 5: CREATE is_complete COLUMN
# ============================================================

# A row is complete when ALL seven numeric measurement columns are non-null
measurement_cols = [
    "Global_active_power", "Global_reactive_power", "Voltage",
    "Global_intensity", "Sub_metering_1", "Sub_metering_2", "Sub_metering_3"
]

df = df.withColumn(
    "is_complete",
    F.when(
        F.col("Global_active_power").isNotNull()
        & F.col("Global_reactive_power").isNotNull()
        & F.col("Voltage").isNotNull()
        & F.col("Global_intensity").isNotNull()
        & F.col("Sub_metering_1").isNotNull()
        & F.col("Sub_metering_2").isNotNull()
        & F.col("Sub_metering_3").isNotNull(),
        F.lit(True)
    ).otherwise(F.lit(False))
)

# ============================================================
# STEP 6: DATA QUALITY REPORT
# ============================================================

complete_count = df.filter(F.col("is_complete") == True).count()
incomplete_count = df.filter(F.col("is_complete") == False).count()
missing_pct = (incomplete_count / raw_count) * 100

# Check for duplicate timestamps (on complete rows only)
complete_df = df.filter(F.col("is_complete") == True)
duplicate_timestamps = complete_df.groupBy("timestamp").count().filter(F.col("count") > 1).count()

print(f"\n{'=' * 60}")
print("DATA QUALITY REPORT")
print("=" * 60)
print(f"Raw row count          : {raw_count:,}")
print(f"Complete rows          : {complete_count:,}")
print(f"Incomplete rows        : {incomplete_count:,}")
print(f"Missing percentage     : {missing_pct:.2f}%")
print(f"Duplicate timestamps   : {duplicate_timestamps:,}")

# ============================================================
# STEP 7: ANALYTICS
# ============================================================

# We compute analytics ONLY on complete rows.
# Global_active_power is in kW, readings are 1-minute apart.
# Energy (kWh) = Power (kW) × Time (hours)
# 1 minute = 1/60 hour, so energy = SUM(power) / 60

print(f"\n{'=' * 60}")
print("ANALYTICS")
print("=" * 60)

# -------------------------------------------------------
# A. SUMMARY STATISTICS
# -------------------------------------------------------

summary = complete_df.select(
    F.round(F.sum("Global_active_power") / 60, 2).alias("total_energy_kwh"),
    F.round(F.avg("Global_active_power"), 4).alias("avg_active_power_kw"),
    F.round(F.max("Global_active_power"), 3).alias("peak_active_power_kw"),
)

summary_row = summary.collect()[0]

# Find the timestamp of the peak
peak_row = complete_df.filter(
    F.col("Global_active_power") == summary_row["peak_active_power_kw"]
).select("timestamp", "Global_active_power").first()

total_kwh = summary_row["total_energy_kwh"]
avg_kw = summary_row["avg_active_power_kw"]
peak_kw = summary_row["peak_active_power_kw"]
peak_ts = str(peak_row["timestamp"])

print(f"\nA. SUMMARY STATISTICS")
print(f"   Total energy (kWh)         : {total_kwh:,.2f}")
print(f"   Average active power (kW)  : {avg_kw:.4f}")
print(f"   Peak active power (kW)     : {peak_kw:.3f}")
print(f"   Peak timestamp             : {peak_ts}")

# -------------------------------------------------------
# B. DAILY CONSUMPTION
# -------------------------------------------------------

daily_df = (
    complete_df
    .withColumn("date", F.to_date("timestamp"))
    .groupBy("date")
    .agg(
        F.round(F.sum("Global_active_power") / 60, 2).alias("total_kwh")
    )
    .orderBy("date")
)

daily_count = daily_df.count()
print(f"\nB. DAILY CONSUMPTION ({daily_count:,} days)")
daily_df.show(5, truncate=False)

# -------------------------------------------------------
# C. HOURLY PROFILE
# -------------------------------------------------------

hourly_df = (
    complete_df
    .withColumn("hour", F.hour("timestamp"))
    .groupBy("hour")
    .agg(
        F.round(F.avg("Global_active_power"), 4).alias("avg_active_power_kw")
    )
    .orderBy("hour")
)

print(f"C. HOURLY PROFILE (24 hours)")
hourly_df.show(24, truncate=False)

# -------------------------------------------------------
# D. WEEKLY PATTERN
# -------------------------------------------------------

weekly_df = (
    complete_df
    .withColumn("day_of_week", F.dayofweek("timestamp"))
    .groupBy("day_of_week")
    .agg(
        F.round(F.avg("Global_active_power"), 4).alias("avg_active_power_kw")
    )
    .orderBy("day_of_week")
)

print(f"D. WEEKLY PATTERN (7 days)")
weekly_df.show(7, truncate=False)

# -------------------------------------------------------
# E. SUB-METER DISTRIBUTION
# -------------------------------------------------------

submeter_df = complete_df.select(
    F.round(F.sum("Sub_metering_1"), 2).alias("sub_metering_1_wh"),
    F.round(F.sum("Sub_metering_2"), 2).alias("sub_metering_2_wh"),
    F.round(F.sum("Sub_metering_3"), 2).alias("sub_metering_3_wh"),
)

submeter_row = submeter_df.collect()[0]
sm1 = submeter_row["sub_metering_1_wh"]
sm2 = submeter_row["sub_metering_2_wh"]
sm3 = submeter_row["sub_metering_3_wh"]
total_metered = sm1 + sm2 + sm3

print(f"E. SUB-METER DISTRIBUTION (Wh)")
print(f"   Sub_metering_1 (kitchen)            : {sm1:>12,.2f} Wh")
print(f"   Sub_metering_2 (laundry)            : {sm2:>12,.2f} Wh")
print(f"   Sub_metering_3 (water heater + AC)  : {sm3:>12,.2f} Wh")
print(f"   Total metered                       : {total_metered:>12,.2f} Wh")

# -------------------------------------------------------
# F. ANOMALY DETECTION (Statistical, No ML)
# -------------------------------------------------------
# Method: Rolling 30-day window mean/stddev.
# Flags days where consumption deviates >2σ from the local rolling mean.
# Severity: normal | warning (2-3σ) | critical (>3σ)

print(f"\nF. ANOMALY DETECTION")

# Daily totals are already in daily_df (date, total_kwh)
# Use a 30-day rolling window for robust local statistics

window_30 = Window.orderBy("date").rowsBetween(-29, 0)

daily_stats = daily_df.withColumn(
    "rolling_mean", F.round(F.avg("total_kwh").over(window_30), 4)
).withColumn(
    "rolling_std", F.round(F.stddev_pop("total_kwh").over(window_30), 4)
)

# Compute global mean/stddev for the expected_min/max bounds
global_stats_row = daily_df.select(
    F.avg("total_kwh").alias("g_mean"),
    F.stddev_pop("total_kwh").alias("g_std"),
).collect()[0]
global_mean = global_stats_row["g_mean"]
global_std = global_stats_row["g_std"]

# Compute the30-day rolling stats and collect to pandas for clean anomaly classification
daily_stats_pdf = daily_stats.toPandas()
daily_stats_pdf.columns = ["date", "total_kwh", "rolling_mean", "rolling_std"]

import pandas as pd
daily_stats_pdf["date"] = pd.to_datetime(daily_stats_pdf["date"])
daily_stats_pdf = daily_stats_pdf.sort_values("date").reset_index(drop=True)

# Classify anomalies based on deviation from rolling mean
anomaly_records = []
for _, row in daily_stats_pdf.iterrows():
    date_str = str(row["date"].date())
    value = row["total_kwh"]
    r_mean = row["rolling_mean"]
    r_std = row["rolling_std"] if pd.notna(row["rolling_std"]) and row["rolling_std"] > 0 else global_std

    # Expected range: rolling_mean ± 2 * rolling_std
    expected_min = round(max(r_mean - 2 * r_std, 0), 4)
    expected_max = round(r_mean + 2 * r_std, 4)

    deviation = abs(value - r_mean) / r_std if r_std > 0 else 0

    if deviation > 3:
        severity = "critical"
    elif deviation > 2:
        severity = "warning"
    else:
        severity = "normal"

    anomaly_records.append({
        "date": date_str,
        "value": round(value, 4),
        "expected_min": expected_min,
        "expected_max": expected_max,
        "severity": severity,
    })

anomaly_pdf = pd.DataFrame(anomaly_records)
anomaly_count = len(anomaly_pdf)
anomaly_warn_crit = len(anomaly_pdf[anomaly_pdf["severity"].isin(["warning", "critical"])])

print(f"   Total days analysed    : {anomaly_count}")
print(f"   Warning anomalies      : {anomaly_warn_crit}")
print(f"   Rolling window         : 30 days")
print(f"   Threshold              : >2std (warning), >3std (critical)")

# -------------------------------------------------------
# G. ENERGY FINGERPRINT (7 × 24 = 168 combinations)
# -------------------------------------------------------
# Group by day-of-week and hour, compute average Global_active_power.
# Uses only complete rows.

print(f"\nG. ENERGY FINGERPRINT (7 x 24)")

fingerprint_df = (
    complete_df
    .withColumn("day_of_week", F.dayofweek("timestamp"))
    .withColumn("hour", F.hour("timestamp"))
    .groupBy("day_of_week", "hour")
    .agg(
        F.round(F.avg("Global_active_power"), 4).alias("avg_kw")
    )
    .orderBy("day_of_week", "hour")
)

fingerprint_count = fingerprint_df.count()
print(f"   Observed combinations : {fingerprint_count}")

# Collect to pandas for gap-filling (ensure all 168 combinations exist)
fp_pdf = fingerprint_df.toPandas()
fp_pdf.columns = ["day_of_week", "hour", "avg_kw"]

# Map day_of_week number to 3-letter abbreviation
# Spark dayofweek(): 1=Sunday, 2=Monday, ..., 7=Saturday
day_map = {1: "Sun", 2: "Mon", 3: "Tue", 4: "Wed", 5: "Thu", 6: "Fri", 7: "Sat"}
fp_pdf["day"] = fp_pdf["day_of_week"].map(day_map)

# Generate all 168 combinations (7 days × 24 hours)
all_days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
all_hours = list(range(24))
complete_grid = pd.DataFrame(
    [(d, h) for d in all_days for h in all_hours],
    columns=["day", "hour"]
)

# Left-join observed data onto the complete grid
fp_complete = complete_grid.merge(
    fp_pdf[["day", "hour", "avg_kw"]],
    on=["day", "hour"],
    how="left"
)

# Fill missing combinations with 0 (no observations)
fp_complete["avg_kw"] = fp_complete["avg_kw"].fillna(0).round(4)

# Sort by day order and hour
day_order = {d: i for i, d in enumerate(all_days)}
fp_complete["day_order"] = fp_complete["day"].map(day_order)
fp_complete = fp_complete.sort_values(["day_order", "hour"]).drop(columns=["day_order"])

fingerprint_final_count = len(fp_complete)
missing_count = 168 - fingerprint_count
print(f"   Final combinations     : {fingerprint_final_count}")
print(f"   Missing (filled with 0): {missing_count}")

# ============================================================
# STEP 8: WRITE RESULTS
# ============================================================

os.makedirs(RESULTS_DIR, exist_ok=True)

# Write using pandas (avoids Hadoop winutils dependency on Windows)
# All Spark analytics are already computed — we just collect the small result sets

# --- HDFS output helper ---
_hdfs_conf = spark._jvm.org.apache.hadoop.conf.Configuration()
_hdfs_conf.set("fs.defaultFS", "hdfs://localhost:9000")
_hdfs_fs = spark._jvm.org.apache.hadoop.fs.FileSystem.get(_hdfs_conf)

def _write_to_hdfs(content, hdfs_path):
    """Write a UTF-8 string to an HDFS path (overwrite if exists)."""
    try:
        path = spark._jvm.org.apache.hadoop.fs.Path(hdfs_path)
        if _hdfs_fs.exists(path):
            _hdfs_fs.delete(path, True)
        out = _hdfs_fs.create(path)
        out.write(content.encode("utf-8"))
        out.close()
        return True
    except Exception as e:
        print(f"  HDFS write FAILED for {hdfs_path}: {e}")
        return False

# Summary as JSON
import json
summary_output = {
    "raw_rows": raw_count,
    "complete_rows": complete_count,
    "incomplete_rows": incomplete_count,
    "missing_percentage": round(missing_pct, 2),
    "duplicate_timestamps": duplicate_timestamps,
    "total_energy_kwh": total_kwh,
    "avg_active_power_kw": avg_kw,
    "peak_active_power_kw": peak_kw,
    "peak_timestamp": peak_ts,
    "sub_metering_1_wh": sm1,
    "sub_metering_2_wh": sm2,
    "sub_metering_3_wh": sm3,
}

with open(os.path.join(RESULTS_DIR, "summary.json"), "w") as f:
    json.dump(summary_output, f, indent=2)
print(f"\nWrote: {RESULTS_DIR}/summary.json")
_write_to_hdfs(json.dumps(summary_output, indent=2), f"{HDFS_OUTPUT}/summary.json")
print(f"  -> HDFS: {HDFS_OUTPUT}/summary.json")

# Daily consumption — collect to pandas and write CSV
daily_pdf = daily_df.toPandas()
daily_pdf.columns = ["date", "total_kwh"]
daily_pdf.to_csv(os.path.join(RESULTS_DIR, "daily_consumption.csv"), index=False)
print(f"Wrote: {RESULTS_DIR}/daily_consumption.csv ({len(daily_pdf)} rows)")
_write_to_hdfs(daily_pdf.to_csv(index=False), f"{HDFS_OUTPUT}/daily_consumption.csv")
print(f"  -> HDFS: {HDFS_OUTPUT}/daily_consumption.csv")

# Hourly profile
hourly_pdf = hourly_df.toPandas()
hourly_pdf.columns = ["hour", "avg_active_power_kw"]
hourly_pdf.to_csv(os.path.join(RESULTS_DIR, "hourly_profile.csv"), index=False)
print(f"Wrote: {RESULTS_DIR}/hourly_profile.csv ({len(hourly_pdf)} rows)")
_write_to_hdfs(hourly_pdf.to_csv(index=False), f"{HDFS_OUTPUT}/hourly_profile.csv")
print(f"  -> HDFS: {HDFS_OUTPUT}/hourly_profile.csv")

# Weekly pattern
weekly_pdf = weekly_df.toPandas()
weekly_pdf.columns = ["day_of_week", "avg_active_power_kw"]
weekly_pdf.to_csv(os.path.join(RESULTS_DIR, "weekly_pattern.csv"), index=False)
print(f"Wrote: {RESULTS_DIR}/weekly_pattern.csv ({len(weekly_pdf)} rows)")
_write_to_hdfs(weekly_pdf.to_csv(index=False), f"{HDFS_OUTPUT}/weekly_pattern.csv")
print(f"  -> HDFS: {HDFS_OUTPUT}/weekly_pattern.csv")

# Sub-meter distribution
submeter_pdf = submeter_df.toPandas()
submeter_pdf.columns = ["sub_metering_1_wh", "sub_metering_2_wh", "sub_metering_3_wh"]
submeter_pdf.to_csv(os.path.join(RESULTS_DIR, "submeter_distribution.csv"), index=False)
print(f"Wrote: {RESULTS_DIR}/submeter_distribution.csv")
_write_to_hdfs(submeter_pdf.to_csv(index=False), f"{HDFS_OUTPUT}/submeter_distribution.csv")
print(f"  -> HDFS: {HDFS_OUTPUT}/submeter_distribution.csv")

# Anomalies
anomaly_pdf.to_csv(os.path.join(RESULTS_DIR, "anomalies.csv"), index=False)
print(f"Wrote: {RESULTS_DIR}/anomalies.csv ({len(anomaly_pdf)} rows)")
_write_to_hdfs(anomaly_pdf.to_csv(index=False), f"{HDFS_OUTPUT}/anomalies.csv")
print(f"  -> HDFS: {HDFS_OUTPUT}/anomalies.csv")

# Fingerprint (168 combinations)
fp_complete[["day", "hour", "avg_kw"]].to_csv(
    os.path.join(RESULTS_DIR, "fingerprint.csv"), index=False
)
print(f"Wrote: {RESULTS_DIR}/fingerprint.csv ({len(fp_complete)} rows)")
_write_to_hdfs(fp_complete[["day", "hour", "avg_kw"]].to_csv(index=False), f"{HDFS_OUTPUT}/fingerprint.csv")
print(f"  -> HDFS: {HDFS_OUTPUT}/fingerprint.csv")

# ============================================================
# STEP 9: VERIFICATION REPORT
# ============================================================

print(f"\n{'=' * 60}")
print("SPARK PROCESSING COMPLETE")
print("=" * 60)
print(f"Raw rows              : {raw_count:,}")
print(f"Complete rows         : {complete_count:,}")
print(f"Incomplete rows       : {incomplete_count:,}")
print(f"Missing percentage    : {missing_pct:.2f}%")
print(f"Duplicate timestamps  : {duplicate_timestamps:,}")
print(f"")
print(f"Total consumption     : {total_kwh:,.2f} kWh")
print(f"Average active power  : {avg_kw:.4f} kW")
print(f"Peak active power     : {peak_kw:.3f} kW")
print(f"Peak timestamp        : {peak_ts}")
print(f"")
print(f"Daily records         : {daily_count:,}")
print(f"Hourly records        : 24")
print(f"Weekly records        : 7")
print(f"Sub-meter records     : 1")
print(f"Anomaly records       : {anomaly_count} ({anomaly_warn_crit} warning/critical)")
print(f"Fingerprint records   : {fingerprint_final_count} (7 days x 24 hours)")
print(f"")
print(f"Results directory     : {RESULTS_DIR}/")
print("=" * 60)

# ============================================================
# CLEANUP
# ============================================================

spark.stop()
print("\nSpark session stopped.")
