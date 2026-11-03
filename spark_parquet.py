"""
PULSE - Apache Parquet Partition Writer (Storage Intelligence)
===============================================================

Reads the raw UCI household power consumption dataset from HDFS, applies the
same cleaning rules as spark_processing.py (complete measurement rows only),
derives a real timestamp plus year/month columns, and writes a partitioned,
Snappy-compressed Parquet dataset:

    /pulse/parquet/year=YYYY/month=MM/part-*.snappy.parquet

After writing, this job inspects the actual files through the Hadoop
FileSystem API, captures the actual Parquet schema, samples a bounded number
of records per partition, and writes a metadata manifest for the dashboard:

    public/data/parquet/manifest.json      (host mount / app data directory)
    public/data/parquet/previews.json
    /pulse/parquet/_pulse/manifest.json    (HDFS evidence copy)
    /pulse/parquet/_pulse/previews.json

Nothing in this script fabricates data: every path, file size, row count,
schema field and sample record comes from the Spark/HDFS execution.

Usage:
    python spark_parquet.py

Docker (preferred, via the existing cluster):
    docker compose --profile tools run --rm spark-parquet

Environment:
    HDFS_NAMENODE              HDFS namenode URI (default: hdfs://localhost:9000)
    SPARK_MASTER_URL           Spark master (default: local[*])
    PULSE_RAW_INPUT            Raw dataset path (default: hdfs:///pulse/raw/household_power_consumption.txt)
    PULSE_PARQUET_HDFS_PATH    HDFS output directory (default: /pulse/parquet)
    PULSE_PARQUET_APP_DIR      Local app-data directory (default: public/data/parquet)
    PULSE_PARQUET_JOB_ID       Job identifier supplied by the dev API
    PULSE_PARQUET_PREVIEW_LIMIT  Sampled records per partition (default: 5)
"""

import json
import os
import re
import sys
import traceback
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import urlparse

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, BooleanType
)

# ============================================================
# CONFIGURATION
# ============================================================

SPARK_MASTER_URL = os.environ.get("SPARK_MASTER_URL", "local[*]")
HDFS_NAMENODE = os.environ.get("HDFS_NAMENODE", "hdfs://localhost:9000")
INPUT_FILE = os.environ.get(
    "PULSE_RAW_INPUT",
    "hdfs:///pulse/raw/household_power_consumption.txt",
)
HDFS_PATH = os.environ.get("PULSE_PARQUET_HDFS_PATH", "/pulse/parquet").strip()
APP_DATA_DIR = os.environ.get(
    "PULSE_PARQUET_APP_DIR",
    os.path.join("public", "data", "parquet"),
)
JOB_ID = re.sub(
    r"[^A-Za-z0-9_.-]",
    "-",
    os.environ.get("PULSE_PARQUET_JOB_ID", "").strip() or
    f"pq-manual-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
)[:80]
PREVIEW_LIMIT = max(1, min(10, int(os.environ.get("PULSE_PARQUET_PREVIEW_LIMIT", "5"))))

RESERVED_HDFS_PREFIXES = ("/pulse/raw", "/pulse/output")

STARTED_AT = datetime.now(timezone.utc)
SPARK = None


# ============================================================
# HELPERS
# ============================================================

def log(message: str = "") -> None:
    print(message, flush=True)


def stage(name: str) -> None:
    print(f"[PULSE] STAGE {name}", flush=True)


def fail(message: str, code: int = 2) -> None:
    print(f"[PULSE] ERROR: {message}", flush=True)
    sys.exit(code)


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def iso_from_ms(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(timespec="seconds")


def normalize_hdfs_path(raw: str) -> str:
    parsed = urlparse(raw)
    path = parsed.path if parsed.scheme else raw
    path = "/" + path.strip("/")
    if not re.match(r"^/[A-Za-z0-9_.=-]+(?:/[A-Za-z0-9_.=-]+)*$", path):
        fail(
            f"Invalid PULSE_PARQUET_HDFS_PATH '{raw}'. Use an absolute HDFS path "
            "containing only letters, digits, underscore, dash, dot, equals and slash."
        )
    if ".." in path.split("/"):
        fail("PULSE_PARQUET_HDFS_PATH must not contain '..'.")
    for reserved in RESERVED_HDFS_PREFIXES:
        if path == reserved or path.startswith(reserved + "/"):
            fail(
                f"Refusing to write Parquet to reserved location '{path}'. "
                "The job never overwrites raw data or existing analytics output."
            )
    if path in ("/", "/pulse"):
        fail(f"Refusing to use '{path}' as the Parquet output directory.")
    return path


def json_value(value):
    """Convert Spark Row values into JSON-safe primitives."""
    if value is None:
        return None
    if isinstance(value, (datetime,)):
        return value.isoformat(sep=" ")
    if isinstance(value, (str, int, float, bool)):
        return value
    try:
        import decimal
        if isinstance(value, decimal.Decimal):
            return float(value)
    except Exception:
        pass
    return str(value)


def detect_compression(first_file_path: str):
    """
    Read the real Parquet footer through parquet-mr to verify the codec.
    Returns a sorted list of codec names, or [] when footer inspection is
    unavailable. Never claims a codec it could not read.
    """
    reader = None
    try:
        hadoop_conf = SPARK._jsc.hadoopConfiguration()
        path_cls = SPARK._jvm.org.apache.hadoop.fs.Path
        input_file_cls = SPARK._jvm.org.apache.parquet.hadoop.util.HadoopInputFile
        reader_cls = SPARK._jvm.org.apache.parquet.hadoop.ParquetFileReader

        hadoop_input = input_file_cls.fromPath(path_cls(first_file_path), hadoop_conf)
        reader = reader_cls.open(hadoop_input)
        footer = reader.getFooter()

        codecs = set()
        for block in footer.getBlocks():
            for column in block.getColumns():
                codecs.add(str(column.getCodec().name()).upper())
        return sorted(codecs)
    except Exception as exc:  # footer inspection is best-effort by design
        log(f"[PULSE] Compression footer inspection unavailable: {exc}")
        return []
    finally:
        if reader is not None:
            try:
                reader.close()
            except Exception:
                pass


def write_local_json(filename: str, payload) -> str:
    os.makedirs(APP_DATA_DIR, exist_ok=True)
    final_path = os.path.join(APP_DATA_DIR, filename)
    tmp_path = final_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    os.replace(tmp_path, final_path)
    return final_path


def write_hdfs_json(filesystem, filename: str, payload) -> None:
    """Best-effort HDFS evidence copy. Local manifest remains authoritative."""
    hdfs_dir = SPARK._jvm.org.apache.hadoop.fs.Path(f"{HDFS_PATH}/_pulse")
    try:
        filesystem.mkdirs(hdfs_dir)
        target = SPARK._jvm.org.apache.hadoop.fs.Path(f"{HDFS_PATH}/_pulse/{filename}")
        output = filesystem.create(target, True)
        output.write(json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8"))
        output.close()
        log(f"[PULSE] HDFS metadata copy: {HDFS_PATH}/_pulse/{filename}")
    except Exception as exc:
        log(f"[PULSE] WARNING: could not write HDFS metadata copy {filename}: {exc}")


# ============================================================
# MAIN JOB
# ============================================================

def main() -> None:
    global SPARK, HDFS_PATH

    HDFS_PATH = normalize_hdfs_path(HDFS_PATH)

    if not (INPUT_FILE.startswith("hdfs://") or INPUT_FILE.startswith("/pulse/")):
        fail(
            "PULSE_RAW_INPUT must be an HDFS path (hdfs:///...) or a /pulse/... path. "
            f"Received: {INPUT_FILE}"
        )
    if any(ch.isspace() for ch in INPUT_FILE):
        fail("PULSE_RAW_INPUT must not contain whitespace.")

    log("=" * 64)
    log("PULSE - APACHE PARQUET PARTITION WRITER")
    log("=" * 64)
    log(f"Job ID          : {JOB_ID}")
    log(f"Spark master    : {SPARK_MASTER_URL}")
    log(f"Raw input       : {INPUT_FILE}")
    log(f"Parquet output  : {HDFS_PATH}")
    log(f"App data dir    : {os.path.abspath(APP_DATA_DIR)}")
    log("")

    stage("prepare")

    SPARK = (
        SparkSession.builder
        .master(SPARK_MASTER_URL)
        .appName(f"PULSE-Parquet-{JOB_ID}")
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.sql.parquet.compression.codec", "snappy")
        .config("spark.hadoop.fs.defaultFS", HDFS_NAMENODE)
        .getOrCreate()
    )
    SPARK.sparkContext.setLogLevel("WARN")

    log(f"Spark version   : {SPARK.version}")
    log(f"Application     : {SPARK.sparkContext.appName}")
    log("")

    # --------------------------------------------------------
    # 1. Validate the real raw dataset
    # --------------------------------------------------------
    stage("validate")

    jvm = SPARK._jvm
    hadoop_conf = SPARK._jsc.hadoopConfiguration()
    path_cls = jvm.org.apache.hadoop.fs.Path

    input_path = path_cls(INPUT_FILE)
    input_fs = input_path.getFileSystem(hadoop_conf)
    if not input_fs.exists(input_path):
        fail(
            f"Raw dataset not found in HDFS: {INPUT_FILE}. "
            "Run `docker compose --profile tools run --rm hdfs-init` first."
        )

    schema = StructType([
        StructField("Date", StringType(), True),
        StructField("Time", StringType(), True),
        StructField("Global_active_power", DoubleType(), True),
        StructField("Global_reactive_power", DoubleType(), True),
        StructField("Voltage", DoubleType(), True),
        StructField("Global_intensity", DoubleType(), True),
        StructField("Sub_metering_1", DoubleType(), True),
        StructField("Sub_metering_2", DoubleType(), True),
        StructField("Sub_metering_3", DoubleType(), True),
    ])

    measurement_cols = [
        "Global_active_power", "Global_reactive_power", "Voltage",
        "Global_intensity", "Sub_metering_1", "Sub_metering_2",
        "Sub_metering_3",
    ]

    raw_df = (
        SPARK.read
        .option("sep", ";")
        .option("header", "true")
        .option("nullValue", "?")
        .schema(schema)
        .csv(INPUT_FILE)
    )

    prepared = (
        raw_df
        .withColumn(
            "timestamp",
            F.try_to_timestamp(
                F.concat_ws(" ", F.col("Date"), F.col("Time")),
                F.lit("d/M/yyyy H:m:s"),
            ),
        )
        .withColumn(
            "is_complete",
            F.when(
                F.col("Global_active_power").isNotNull()
                & F.col("Global_reactive_power").isNotNull()
                & F.col("Voltage").isNotNull()
                & F.col("Global_intensity").isNotNull()
                & F.col("Sub_metering_1").isNotNull()
                & F.col("Sub_metering_2").isNotNull()
                & F.col("Sub_metering_3").isNotNull()
                & F.col("timestamp").isNotNull(),
                F.lit(True),
            ).otherwise(F.lit(False)),
        )
    )

    counts = prepared.agg(
        F.count(F.lit(1)).alias("raw_rows"),
        F.sum(F.when(F.col("is_complete"), F.lit(1)).otherwise(F.lit(0))).alias("complete_rows"),
    ).collect()[0]
    raw_rows = int(counts["raw_rows"] or 0)
    complete_rows = int(counts["complete_rows"] or 0)

    log(f"Raw rows        : {raw_rows:,}")
    log(f"Complete rows   : {complete_rows:,}")
    log(f"Rejected rows   : {raw_rows - complete_rows:,}")
    log("")

    if complete_rows == 0:
        fail(
            "No complete rows were found in the raw dataset. "
            "Refusing to create an empty Parquet dataset."
        )

    clean_df = (
        prepared
        .filter(F.col("is_complete") == True)
        .withColumn("year", F.year("timestamp"))
        .withColumn("month", F.lpad(F.month("timestamp").cast("string"), 2, "0"))
        .select(
            "timestamp",
            *measurement_cols,
            F.lit(True).alias("is_complete"),
            "year",
            "month",
        )
    )

    # Exact per-partition row counts are captured during the generation run.
    count_rows = (
        clean_df.groupBy("year", "month")
        .agg(F.count(F.lit(1)).alias("row_count"))
        .collect()
    )
    partition_counts = {
        f"{int(row['year'])}-{str(row['month'])}": int(row["row_count"])
        for row in count_rows
    }
    written_rows = sum(partition_counts.values())
    if written_rows != complete_rows:
        # Both counts come from the same DataFrame, so a mismatch would mean
        # the source changed mid-run. The manifest records the grouped total
        # actually written by this execution rather than the earlier count.
        log(
            "[PULSE] WARNING: complete-row count changed between validation and "
            f"partition counting ({complete_rows:,} vs {written_rows:,})."
        )

    # --------------------------------------------------------
    # 2. Write real partitioned Parquet to HDFS
    # --------------------------------------------------------
    stage("write")
    log(f"Writing Snappy Parquet to {HDFS_PATH} ...")
    log("Spark writer: mode=overwrite, partitionBy(year, month), compression=snappy")

    (
        clean_df.write
        .mode("overwrite")
        .option("compression", "snappy")
        .partitionBy("year", "month")
        .parquet(HDFS_PATH)
    )
    log("[PULSE] Spark Parquet write completed.")
    log("")

    # --------------------------------------------------------
    # 3. Inspect actual files and Parquet schema
    # --------------------------------------------------------
    stage("inspect")

    output_schema = SPARK.read.parquet(HDFS_PATH).schema
    schema_fields = [
        {
            "name": field.name,
            "type": field.dataType.simpleString(),
            "nullable": bool(field.nullable),
            "isPartition": field.name in ("year", "month"),
        }
        for field in output_schema.fields
    ]

    root_path = path_cls(HDFS_PATH)
    root_fs = root_path.getFileSystem(hadoop_conf)
    if not root_fs.exists(root_path):
        fail(f"Parquet output directory was not created: {HDFS_PATH}")

    root_uri = f"{str(root_fs.getUri()).rstrip('/')}{HDFS_PATH}"
    files = []

    def walk(directory) -> None:
        for status in root_fs.listStatus(directory):
            name = status.getPath().getName()
            if status.isDirectory():
                # Spark writes hidden helper directories (_temporary, _pulse).
                if name.startswith("_") or name.startswith("."):
                    continue
                walk(status.getPath())
            else:
                if name.startswith("_") or name.startswith(".") or not name.endswith(".parquet"):
                    continue
                full_path = status.getPath().toString()
                match = re.search(r"/year=(\d{4})/month=(\d{1,2})/", full_path)
                if not match:
                    continue
                files.append({
                    "name": name,
                    "path": full_path,
                    "sizeBytes": int(status.getLen()),
                    "lastModified": iso_from_ms(int(status.getModificationTime())),
                    "year": int(match.group(1)),
                    "month": match.group(2).zfill(2),
                })

    walk(root_path)

    if not files:
        fail(
            f"Spark completed but no .parquet files were found under {HDFS_PATH}. "
            "Check the Spark job output and HDFS permissions."
        )

    grouped = defaultdict(list)
    for file_info in files:
        grouped[(file_info["year"], file_info["month"])].append(file_info)

    partitions = []
    for (year, month), partition_files in sorted(grouped.items()):
        partition_files.sort(key=lambda item: item["name"])
        row_count = partition_counts.get(f"{year}-{month}")
        max_modified_ms = None
        for item in partition_files:
            modified_dt = datetime.fromisoformat(item["lastModified"].replace("Z", "+00:00"))
            modified_ms = int(modified_dt.timestamp() * 1000)
            if max_modified_ms is None or modified_ms > max_modified_ms:
                max_modified_ms = modified_ms
        partitions.append({
            "year": year,
            "month": month,
            "path": f"{root_uri}/year={year}/month={month}",
            "fileCount": len(partition_files),
            "sizeBytes": sum(item["sizeBytes"] for item in partition_files),
            "rowCount": row_count,
            "rowCountType": "exact" if row_count is not None else None,
            "lastModified": iso_from_ms(max_modified_ms) if max_modified_ms is not None else None,
            "files": [
                {
                    "name": item["name"],
                    "path": item["path"],
                    "sizeBytes": item["sizeBytes"],
                    "lastModified": item["lastModified"],
                }
                for item in partition_files
            ],
        })

    total_files = len(files)
    total_size = sum(item["sizeBytes"] for item in files)
    latest_modified = max(item["lastModified"] for item in files)

    # Verify the codec by reading the actual Parquet footer where available.
    codecs = detect_compression(files[0]["path"])
    if len(codecs) == 1:
        compression = codecs[0].lower()
        compression_verified = True
        compression_source = "parquet-footer"
    elif codecs:
        compression = ", ".join(codec.lower() for codec in codecs)
        compression_verified = True
        compression_source = "parquet-footer"
    else:
        compression = "snappy"
        compression_verified = False
        compression_source = "writer-config"

    log(f"Partitions      : {len(partitions)}")
    log(f"Parquet files   : {total_files}")
    log(f"Partitioned rows: {written_rows:,} (exact)")
    log(f"Total size      : {total_size:,} bytes")
    log(f"Compression     : {compression} ({compression_source})")
    log("")

    # --------------------------------------------------------
    # 4. Bounded Spark sample per partition
    # --------------------------------------------------------
    stage("preview")
    previews = {}
    preview_samples = {}
    for partition in partitions:
        key = f"{partition['year']}-{partition['month']}"
        try:
            rows = (
                SPARK.read.parquet(partition["path"])
                .limit(PREVIEW_LIMIT)
                .collect()
            )
            records = [
                {name: json_value(value) for name, value in row.asDict().items()}
                for row in rows
            ]
            columns = list(records[0].keys()) if records else [field["name"] for field in schema_fields]
            preview_samples[key] = {
                "columns": columns,
                "records": records,
            }
            log(f"  {key}: sampled {len(records)} record(s) with Spark")
        except Exception as exc:
            preview_samples[key] = {
                "columns": [],
                "records": [],
                "error": str(exc),
            }
            log(f"  {key}: preview unavailable - {exc}")

    previews_payload = {
        "format": "parquet-previews",
        "datasetPath": root_uri,
        "hdfsPath": HDFS_PATH,
        "jobId": JOB_ID,
        "generatedAt": iso_now(),
        "limit": PREVIEW_LIMIT,
        "source": "spark-sampled",
        "partitions": preview_samples,
    }

    # --------------------------------------------------------
    # 5. Metadata manifest from actual execution
    # --------------------------------------------------------
    stage("manifest")

    completed_at = iso_now()
    manifest = {
        "format": "parquet",
        "datasetPath": root_uri,
        "hdfsPath": HDFS_PATH,
        "compression": compression,
        "compressionVerified": compression_verified,
        "compressionSource": compression_source,
        "partitionColumns": ["year", "month"],
        "partitionLayout": "year=YYYY/month=MM",
        "totalPartitions": len(partitions),
        "totalFiles": total_files,
        "totalSizeBytes": total_size,
        "totalRows": written_rows,
        "rowCountType": "exact",
        "rawRows": raw_rows,
        "incompleteRows": raw_rows - complete_rows,
        "schema": schema_fields,
        "partitions": partitions,
        "lastModified": latest_modified,
        "startedAt": STARTED_AT.isoformat(timespec="seconds"),
        "completedAt": completed_at,
        "generatedAt": completed_at,
        "executionStatus": "completed",
        "jobId": JOB_ID,
        "sparkVersion": SPARK.version,
        "sparkMaster": SPARK_MASTER_URL,
        "previewLimit": PREVIEW_LIMIT,
        "previewFile": "previews.json",
    }

    local_preview_path = write_local_json("previews.json", previews_payload)
    local_manifest_path = write_local_json("manifest.json", manifest)

    write_hdfs_json(root_fs, "previews.json", previews_payload)
    write_hdfs_json(root_fs, "manifest.json", manifest)

    log("")
    log(f"Manifest (app)  : {local_manifest_path}")
    log(f"Previews (app)  : {local_preview_path}")
    log(f"Manifest (HDFS) : {HDFS_PATH}/_pulse/manifest.json")
    log("")
    log("=" * 64)
    log("PARQUET GENERATION COMPLETE")
    log("=" * 64)
    log(f"Job ID          : {JOB_ID}")
    log(f"Dataset         : {root_uri}")
    log(f"Partitions      : {len(partitions)}")
    log(f"Files           : {total_files}")
    log(f"Rows (exact)    : {written_rows:,}")
    log(f"Size            : {total_size:,} bytes")
    log(f"Compression     : {compression} ({compression_source})")
    log("=" * 64)

    stage("done")
    log(f"[PULSE] SUCCESS: partitioned Parquet dataset generated at {root_uri}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(f"[PULSE] ERROR: {exc}", flush=True)
        traceback.print_exc()
        sys.exit(1)
    finally:
        if SPARK is not None:
            try:
                SPARK.stop()
            except Exception:
                pass
            print("Spark session stopped.", flush=True)
