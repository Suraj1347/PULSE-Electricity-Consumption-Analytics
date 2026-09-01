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

1. Place `household_power_consumption.txt` in the project root
2. Set up HDFS: `.\hdfs_setup.ps1`
3. Run Spark processing: `python spark_processing.py`
4. Copy results from `results/` to `public/data/`
5. Frontend loads data from `public/data/` at runtime

## Dashboard Sections

- **Command Center** — Overview metrics and energy fingerprint
- **Daily Signal** — Daily consumption patterns with anomaly highlighting
- **Temporal Patterns** — Hourly and weekly consumption analysis
- **Anomaly Radar** — Statistical deviation detection (>2σ)
- **Submeter Intelligence** — Kitchen, laundry, and HVAC breakdown
- **Data Engine** — Processing methodology and pipeline details
