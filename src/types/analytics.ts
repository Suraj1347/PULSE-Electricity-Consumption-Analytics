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
