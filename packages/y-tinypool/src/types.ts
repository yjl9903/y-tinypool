export type WorkerOp = 'merge' | 'apply';

export interface SkipLog {
  op: WorkerOp;
  index: number;
  reason: string;
}

export interface TaskRunOptions {
  skipInvalidUpdates?: boolean;
  timeout?: number;
  transfer?: boolean;
}

export interface YTinypoolOptions {
  minThreads?: number;
  maxThreads?: number;
  idleTimeout?: number;
  execArgv?: string[];
  skipInvalidUpdates?: boolean;
}

export interface WorkerTask {
  op: WorkerOp;
  updates: unknown[];
  skipInvalidUpdates: boolean;
}

export type WorkerErrorCode =
  | 'INVALID_TASK'
  | 'INVALID_UPDATE'
  | 'TASK_FAILED'
  | 'POOL_DESTROYED'
  | 'POOL_RUN_FAILED'
  | 'TASK_TIMEOUT';

export interface WorkerError {
  code: WorkerErrorCode;
  message: string;
  op?: WorkerOp;
  index?: number;
}

export interface WorkerSuccessResult {
  ok: true;
  data: Uint8Array;
  skips: SkipLog[];
}

export interface WorkerErrorResult {
  ok: false;
  error: WorkerError;
  skips: SkipLog[];
}

export type WorkerResult = WorkerSuccessResult | WorkerErrorResult;

export interface MergeSuccessResult {
  ok: true;
  update: Uint8Array;
  skips: SkipLog[];
}

export interface ApplySuccessResult {
  ok: true;
  update: Uint8Array;
  skips: SkipLog[];
}

export type MergeResult = MergeSuccessResult | WorkerErrorResult;

export type ApplyResult = ApplySuccessResult | WorkerErrorResult;
