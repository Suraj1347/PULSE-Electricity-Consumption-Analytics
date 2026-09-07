# PULSE — Energy Intelligence Dashboard

Interactive analytics platform for household electricity consumption data. Transforms 2+ million minute-level power readings into actionable energy intelligence through Apache Spark processing and a cinematic React frontend.

## Architecture

- **Frontend:** React 19, TypeScript, Vite, Recharts, Framer Motion
- **Backend:** Apache Spark (PySpark) on HDFS
- **Dataset:** UCI Machine Learning Repository — Household Electric Power Consumption (Sceaux, France, Dec 2006 – Nov 2010)

## Project Structure

```
spark_processing.py          # Spark data pipeline
hdfs_setup.ps1               # HDFS environment setup
household_power_consumption.txt  # Raw UCI dataset

results/                     # Spark output (CSV/JSON)
public/data/                 # Frontend data (served by Vite)
src/                         # React application source
```

## Getting Started

```bash
cd "C:\Users\udaya\OneDrive\Desktop\Academics\BigData\PULSE-Electricity-Consumption-Analytics"
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | Run oxlint |
| `npm run preview` | Preview production build |

## Data Pipeline

### Option A — Docker (recommended)

Runs a 3-datanode HDFS cluster and a 2-worker Spark standalone cluster in containers — no local Hadoop/Java/PySpark install needed.

```bash
cd "C:\Users\udaya\OneDrive\Desktop\Academics\BigData\PULSE-Electricity-Consumption-Analytics"

# 1. Place household_power_consumption.txt in the project root

# 2. Start the HDFS + Spark cluster
docker compose up -d namenode datanode1 datanode2 datanode3 spark-master spark-worker1 spark-worker2

# 3. Create HDFS dirs and upload the dataset (equivalent of hdfs_setup.ps1)
docker compose --profile tools run --rm hdfs-init

# 4. Run the Spark job (equivalent of `python spark_processing.py`)
docker compose --profile tools run --rm spark-job

# 5. Copy results to public/data/, then tear the cluster down when done
cp results/* public/data/
docker compose down
```

- HDFS web UI: http://localhost:9870
- Spark master web UI: http://localhost:8080

### Option B — Native (Windows + local Hadoop/Spark)

1. `cd "C:\Users\udaya\OneDrive\Desktop\Academics\BigData\PULSE-Electricity-Consumption-Analytics"`
2. Place `household_power_consumption.txt` in the project root
3. Set up HDFS: `.\hdfs_setup.ps1`
4. Run Spark processing: `python spark_processing.py`
5. Copy results from `results/` to `public/data/`
6. Frontend loads data from `public/data/` at runtime

## Live Streaming (optional)

Replays `household_power_consumption.txt` through Kafka at an accelerated, looping rate and consumes it live with Spark Structured Streaming, which writes a JSON snapshot the dashboard's **Live Stream** section polls every 2 seconds. This is separate from the batch pipeline above — Kafka has nothing to do with `/pulse/output/`.

```bash
cd "C:\Users\udaya\OneDrive\Desktop\Academics\BigData\PULSE-Electricity-Consumption-Analytics"

# Requires: batch pipeline already run at least once (so household_power_consumption.txt exists)
docker compose --profile streaming up -d
```

This starts:
- `kafka` — single-node Kafka broker (KRaft mode, no ZooKeeper)
- `kafka-producer` — replays the dataset into the `pulse-readings` topic (~20 msg/s, loops forever)
- `spark-streaming` — Spark Structured Streaming job that consumes the topic and writes `public/data/live_stream.json` on every micro-batch

Open the dashboard and scroll to **07 Live Stream** — it should start showing live-updating readings within a few seconds. Tear down with:

```bash
docker compose --profile streaming down
```

**Or skip the CLI entirely:** the Live Stream section itself has a **Start/Stop Streaming** button. It calls a small dev-only control API (`vite-plugins/dockerControl.ts`, mounted only on `npm run dev` — never in a production build) that runs `docker compose --profile streaming up -d` / `stop` for you and polls container state every 3s. Stop uses `stop` rather than `down`, so containers (and the Spark job's Kafka-connector jar cache) persist — the first start after a fresh `docker compose down` takes ~60–90s while Spark resolves its Kafka connector; every start after that is a few seconds.

## Dashboard Sections

- **Command Center** — Overview metrics and energy fingerprint
- **Daily Signal** — Daily consumption patterns with anomaly highlighting
- **Temporal Patterns** — Hourly and weekly consumption analysis
- **Anomaly Radar** — Statistical deviation detection (>2σ)
- **Submeter Intelligence** — Kitchen, laundry, and HVAC breakdown
- **Data Engine** — Processing methodology and pipeline details
- **Live Stream** — Kafka + Spark Structured Streaming live replay (optional)
