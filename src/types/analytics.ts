export interface DailyConsumptionPoint {
  date: string;
  consumption: number;
  month: string;
  year: number;
}

export interface HourlyProfilePoint {
  hour: number;
  label: string;
  averageConsumption: number;
}

export interface WeeklyPatternPoint {
  day: string;
  dayIndex: number;
  averageConsumption: number;
}

export interface SubMeterData {
  category: string;
  label: string;
  value: number;
  color: string;
}

export interface SparkSummary {
  raw_rows: number;
  complete_rows: number;
  incomplete_rows: number;
  missing_percentage: number;
  duplicate_timestamps: number;
  total_energy_kwh: number;
  avg_active_power_kw: number;
  peak_active_power_kw: number;
  peak_timestamp: string;
  sub_metering_1_wh: number;
  sub_metering_2_wh: number;
  sub_metering_3_wh: number;
}

export interface AnomalyRecord {
  date: string;
  value: number;
  expected_min: number;
  expected_max: number;
  severity: 'normal' | 'warning' | 'critical';
}

export interface FingerprintRecord {
  day: string;
  hour: number;
  avg_kw: number;
}

export interface LiveReading {
  timestamp: string;
  global_active_power: number;
  voltage: number | null;
  global_intensity: number | null;
  sub_metering_1: number;
  sub_metering_2: number;
  sub_metering_3: number;
  produced_at: number;
  consumed_at: number;
}

export interface LiveStreamPayload {
  updated_at: number;
  batch_id: number;
  new_in_batch: number;
  buffer_size: number;
  latest: LiveReading;
  avg_power_kw: number;
  peak_power_kw: number;
  min_power_kw: number;
  recent: LiveReading[];
}
