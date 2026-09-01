# ============================================================
# PULSE — HDFS Setup & Data Ingestion Script
# ============================================================
#
# Creates the HDFS directory structure and uploads the dataset.
# Run this once from the project root in PowerShell:
#
#   .\hdfs_setup.ps1
#
# Prerequisites:
#   - Hadoop 3.4.1 installed at C:\hadoop\hadoop-3.4.1
#   - NameNode and DataNode running
#   - JAVA_HOME = C:\jdk
#
# ============================================================

$ErrorActionPreference = "Stop"

$HADOOP_HOME = "C:\hadoop\hadoop-3.4.1"
$JAVA_HOME   = "C:\jdk"
$HDFS_CMD    = "$HADOOP_HOME\bin\hdfs.cmd"
$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$DATASET     = "$PROJECT_DIR\household_power_consumption.txt"

$env:HADOOP_HOME = $HADOOP_HOME
$env:JAVA_HOME   = $JAVA_HOME
$env:PATH        = "$HADOOP_HOME\bin;$env:PATH"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " PULSE — HDFS Setup & Data Ingestion" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Step 1: Create HDFS directories ----
Write-Host "[1/4] Creating HDFS directories..." -ForegroundColor Yellow

& $HDFS_CMD dfs -mkdir -p /pulse/raw    2>$null
& $HDFS_CMD dfs -mkdir -p /pulse/output 2>$null

Write-Host "  /pulse/raw    created (or already exists)" -ForegroundColor Green
Write-Host "  /pulse/output created (or already exists)" -ForegroundColor Green
Write-Host ""

# ---- Step 2: Check if dataset already uploaded ----
Write-Host "[2/4] Checking for existing dataset in HDFS..." -ForegroundColor Yellow

$existing = & $HDFS_CMD dfs -ls /pulse/raw/household_power_consumption.txt 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Dataset already exists in HDFS:" -ForegroundColor Yellow
    Write-Host "  $existing" -ForegroundColor Gray
    Write-Host ""
    $confirm = Read-Host "  Re-upload? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "  Skipping upload." -ForegroundColor Yellow
        Write-Host ""
        # Skip to verification
        Write-Host "[4/4] Verifying HDFS dataset..." -ForegroundColor Yellow
        & $HDFS_CMD dfs -ls /pulse/raw/ 2>&1
        $hdfsSize = & $HDFS_CMD dfs -du -s /pulse/raw/household_power_consumption.txt 2>&1
        Write-Host "  HDFS size: $hdfsSize" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Done." -ForegroundColor Green
        return
    }
}
$LASTEXITCODE = 0

# ---- Step 3: Upload dataset ----
Write-Host "[3/4] Uploading dataset to HDFS..." -ForegroundColor Yellow

if (-not (Test-Path $DATASET)) {
    Write-Host "  ERROR: Dataset not found at $DATASET" -ForegroundColor Red
    Write-Host "  Make sure household_power_consumption.txt is in the project root." -ForegroundColor Red
    exit 1
}

$localSize = (Get-Item $DATASET).Length
$localSizeMB = [math]::Round($localSize / 1MB, 2)
Write-Host "  Local file: $DATASET ($localSizeMB MB)" -ForegroundColor Gray
Write-Host "  Uploading... (this may take 1-2 minutes)" -ForegroundColor Gray
Write-Host ""

& $HDFS_CMD dfs -put -f $DATASET /pulse/raw/household_power_consumption.txt 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Upload failed." -ForegroundColor Red
    exit 1
}

Write-Host "  Upload complete." -ForegroundColor Green
Write-Host ""

# ---- Step 4: Verify ----
Write-Host "[4/4] Verifying HDFS dataset..." -ForegroundColor Yellow

Write-Host ""
Write-Host "  Contents of /pulse/raw/:" -ForegroundColor Gray
& $HDFS_CMD dfs -ls /pulse/raw/ 2>&1

Write-Host ""
Write-Host "  HDFS file size:" -ForegroundColor Gray
& $HDFS_CMD dfs -du -s /pulse/raw/household_power_consumption.txt 2>&1

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " HDFS Structure:" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
& $HDFS_CMD dfs -ls -R /pulse/ 2>&1

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host ""
