import type {
  SparkSummary,
  DailyConsumptionPoint,
  HourlyProfilePoint,
  WeeklyPatternPoint,
  SubMeterData,
  AnomalyRecord,
  FingerprintRecord,
} from '../types/analytics';

function parseCSV(text: string): string[][] {
  return text
    .trim()
    .split('\n')
    .map(line => line.split(',').map(cell => cell.trim()));
}

export async function loadSummary(): Promise<SparkSummary> {
  const res = await fetch('/data/summary.json');
  if (!res.ok) throw new Error(`Failed to load summary: ${res.status}`);
  return res.json();
}

export async function loadDailyConsumption(): Promise<DailyConsumptionPoint[]> {
  const res = await fetch('/data/daily_consumption.csv');
  if (!res.ok) throw new Error(`Failed to load daily consumption: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  const header = rows[0];
  const dateIdx = header.indexOf('date');
  const kwhIdx = header.indexOf('total_kwh');
  return rows.slice(1).map(row => ({
    date: row[dateIdx],
    consumption: parseFloat(row[kwhIdx]),
    month: '',
    year: 0,
  }));
}

export async function loadHourlyProfile(): Promise<HourlyProfilePoint[]> {
  const res = await fetch('/data/hourly_profile.csv');
  if (!res.ok) throw new Error(`Failed to load hourly profile: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  const header = rows[0];
  const hourIdx = header.indexOf('hour');
  const powerIdx = header.indexOf('avg_active_power_kw');
  return rows.slice(1).map(row => {
    const hour = parseInt(row[hourIdx], 10);
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      averageConsumption: parseFloat(row[powerIdx]),
    };
  });
}

export async function loadWeeklyPattern(): Promise<WeeklyPatternPoint[]> {
  const res = await fetch('/data/weekly_pattern.csv');
  if (!res.ok) throw new Error(`Failed to load weekly pattern: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  const header = rows[0];
  const dayIdx = header.indexOf('day_of_week');
  const powerIdx = header.indexOf('avg_active_power_kw');
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return rows.slice(1).map(row => {
    const dayIndex = parseInt(row[dayIdx], 10) - 1;
    return {
      day: dayNames[dayIndex] || `Day ${row[dayIdx]}`,
      dayIndex,
      averageConsumption: parseFloat(row[powerIdx]),
    };
  });
}

export async function loadSubMeterData(): Promise<SubMeterData[]> {
  const res = await fetch('/data/submeter_distribution.csv');
  if (!res.ok) throw new Error(`Failed to load sub-meter data: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  const header = rows[0];
  const sm1Idx = header.indexOf('sub_metering_1_wh');
  const sm2Idx = header.indexOf('sub_metering_2_wh');
  const sm3Idx = header.indexOf('sub_metering_3_wh');
  const data = rows[1];
  return [
    { category: 'kitchen', label: 'Kitchen', value: parseFloat(data[sm1Idx]), color: '#00d4aa' },
    { category: 'laundry', label: 'Laundry', value: parseFloat(data[sm2Idx]), color: '#3b82f6' },
    { category: 'water_ac', label: 'Water Heater + AC', value: parseFloat(data[sm3Idx]), color: '#f59e0b' },
  ];
}

export async function loadAnomalies(): Promise<AnomalyRecord[]> {
  const res = await fetch('/data/anomalies.csv');
  if (!res.ok) throw new Error(`Failed to load anomalies: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  const header = rows[0];
  const dateIdx = header.indexOf('date');
  const valueIdx = header.indexOf('value');
  const minIdx = header.indexOf('expected_min');
  const maxIdx = header.indexOf('expected_max');
  const sevIdx = header.indexOf('severity');
  return rows.slice(1)
    .filter(row => row[sevIdx] === 'warning' || row[sevIdx] === 'critical')
    .map(row => ({
      date: row[dateIdx],
      value: parseFloat(row[valueIdx]),
      expected_min: parseFloat(row[minIdx]),
      expected_max: parseFloat(row[maxIdx]),
      severity: row[sevIdx] as 'warning' | 'critical',
    }));
}

export async function loadFingerprint(): Promise<FingerprintRecord[]> {
  const res = await fetch('/data/fingerprint.csv');
  if (!res.ok) throw new Error(`Failed to load fingerprint: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  const header = rows[0];
  const dayIdx = header.indexOf('day');
  const hourIdx = header.indexOf('hour');
  const kwIdx = header.indexOf('avg_kw');
  return rows.slice(1).map(row => ({
    day: row[dayIdx],
    hour: parseInt(row[hourIdx], 10),
    avg_kw: parseFloat(row[kwIdx]),
  }));
}
