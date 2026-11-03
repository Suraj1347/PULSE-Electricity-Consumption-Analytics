export type ParquetJobState = 'running' | 'completed' | 'failed';

export type ParquetJobStage =
  | 'prepare'
  | 'validate'
  | 'write'
  | 'inspect'
  | 'preview'
  | 'manifest'
  | 'done'
  | 'failed';

export type ParquetJobRunner = 'docker' | 'local';

export interface ParquetFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  lastModified: string | null;
}

export interface ParquetPartition {
  year: number;
  month: string;
  path: string;
  fileCount: number;
  sizeBytes: number;
  rowCount: number | null;
  rowCountType: 'exact' | 'estimated' | null;
  lastModified: string | null;
  files: ParquetFileInfo[];
}

export interface ParquetSchemaField {
  name: string;
  type: string;
  nullable: boolean;
  isPartition: boolean;
}

export interface ParquetYearSummary {
  year: number;
  partitionCount: number;
  fileCount: number;
  sizeBytes: number;
  rowCount: number | null;
  months: ParquetPartition[];
}

export interface ParquetManifest {
  format: string;
  datasetPath: string;
  hdfsPath?: string;
  compression: string;
  compressionVerified: boolean;
  compressionSource: string;
  partitionColumns: string[];
  partitionLayout?: string;
  totalPartitions: number;
  totalFiles: number;
  totalSizeBytes: number;
  totalRows: number | null;
  rowCountType: 'exact' | 'estimated' | null;
  rawRows?: number;
  incompleteRows?: number;
  schema: ParquetSchemaField[];
  partitions: ParquetPartition[];
  lastModified?: string | null;
  startedAt?: string;
  completedAt?: string;
  generatedAt: string;
  executionStatus: string;
  jobId: string;
  sparkVersion?: string;
  sparkMaster?: string;
  previewLimit?: number;
  previewFile?: string;
}

export type ParquetMetadataErrorKind =
  | 'none'
  | 'not_generated'
  | 'empty'
  | 'hdfs_unavailable';

export interface ParquetMetadata {
  available: boolean;
  source: 'hdfs' | 'manifest' | 'none';
  degraded: boolean;
  errorKind: ParquetMetadataErrorKind;
  message: string | null;
  detail: string | null;
  datasetPath: string;
  hdfsPath: string;
  format: 'parquet';
  compression: string | null;
  compressionVerified: boolean;
  compressionSource: string | null;
  partitionColumns: string[];
  totalPartitions: number;
  totalFiles: number;
  totalSizeBytes: number;
  totalRows: number | null;
  rowCountType: 'exact' | 'estimated' | null;
  schema: ParquetSchemaField[];
  partitions: ParquetPartition[];
  years: ParquetYearSummary[];
  generatedAt: string | null;
  lastModified: string | null;
  manifestGeneratedAt: string | null;
  manifestMatchesDataset: boolean;
  jobId: string | null;
  sparkVersion: string | null;
  rawRows: number | null;
  incompleteRows: number | null;
  inspectedAt: string;
}

export interface ParquetJobView {
  id: string;
  status: ParquetJobState;
  stage: ParquetJobStage;
  runner: ParquetJobRunner;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  logTail: string;
  logBytes: number;
  logTruncated: boolean;
  error: string | null;
}

export interface ParquetStatusResponse {
  running: boolean;
  job: ParquetJobView | null;
}

export interface ParquetSchemaResponse {
  available: boolean;
  message: string | null;
  datasetPath: string | null;
  compression: string | null;
  compressionVerified: boolean;
  compressionSource: string | null;
  partitionColumns: string[];
  schema: ParquetSchemaField[];
  generatedAt: string | null;
  jobId: string | null;
  totalRows: number | null;
  rowCountType: 'exact' | 'estimated' | null;
  manifestMatchesDataset: boolean;
}

export interface ParquetPreviewPartition {
  columns: string[];
  records: Array<Record<string, unknown>>;
  error?: string;
}

export interface ParquetPreviewFile {
  format: string;
  datasetPath: string;
  hdfsPath: string;
  jobId: string;
  generatedAt: string;
  limit: number;
  source: string;
  partitions: Record<string, ParquetPreviewPartition>;
}

export interface ParquetPreviewResponse {
  available: boolean;
  message: string | null;
  year: number | null;
  month: string | null;
  limit: number | null;
  columns: string[];
  records: Array<Record<string, unknown>>;
  generatedAt: string | null;
  jobId: string | null;
  source: 'spark-sampled' | null;
}

export interface ParquetStartResponse {
  ok: boolean;
  job?: ParquetJobView;
  error?: string;
  detail?: string;
}
