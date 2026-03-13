import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Tinypool from 'tinypool';

import type {
  ApplyResult,
  MergeResult,
  TaskRunOptions,
  WorkerResult,
  WorkerTask,
  YTinypoolOptions
} from './types';

function resolveWorkerFile(): string {
  const workerTsUrl = new URL('./worker.ts', import.meta.url);
  if (existsSync(fileURLToPath(workerTsUrl))) {
    return workerTsUrl.href;
  }
  return new URL('./worker.cjs', import.meta.url).href;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class YTinypool {
  private readonly pool: Tinypool;

  private readonly defaultSkipInvalidUpdates: boolean;

  private destroyed = false;

  constructor(options: YTinypoolOptions = {}) {
    const workerFilename = resolveWorkerFile();

    this.defaultSkipInvalidUpdates = options.skipInvalidUpdates ?? false;

    const poolOptions: ConstructorParameters<typeof Tinypool>[0] = {
      runtime: 'worker_threads',
      filename: workerFilename,
      execArgv: options.execArgv ?? (workerFilename.endsWith('.ts') ? ['--import', 'tsx'] : [])
    };

    if (options.minThreads !== undefined) {
      poolOptions.minThreads = options.minThreads;
    }
    if (options.maxThreads !== undefined) {
      poolOptions.maxThreads = options.maxThreads;
    }
    if (options.idleTimeout !== undefined) {
      poolOptions.idleTimeout = options.idleTimeout;
    }

    this.pool = new Tinypool({
      ...poolOptions
    });
  }

  async mergeUpdates(updates: Uint8Array[], options: TaskRunOptions = {}): Promise<MergeResult> {
    const result = await this.runWorkerTask(
      {
        op: 'merge',
        updates,
        skipInvalidUpdates: options.skipInvalidUpdates ?? this.defaultSkipInvalidUpdates
      },
      options
    );

    if (!result.ok) {
      return result;
    }

    return { ok: true, update: result.data, skips: result.skips };
  }

  async applyUpdates(updates: Uint8Array[], options: TaskRunOptions = {}): Promise<ApplyResult> {
    const result = await this.runWorkerTask(
      {
        op: 'apply',
        updates,
        skipInvalidUpdates: options.skipInvalidUpdates ?? this.defaultSkipInvalidUpdates
      },
      options
    );

    if (!result.ok) {
      return result;
    }

    return { ok: true, update: result.data, skips: result.skips };
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    await this.pool.destroy();
  }

  private async runWorkerTask(task: WorkerTask, options: TaskRunOptions): Promise<WorkerResult> {
    if (this.destroyed) {
      return {
        ok: false,
        skips: [],
        error: {
          code: 'POOL_DESTROYED',
          message: 'YTinypool has been destroyed.',
          op: task.op
        }
      };
    }

    const timeout = options.timeout;
    const hasTimeout = typeof timeout === 'number' && Number.isFinite(timeout);
    const timeoutMs = hasTimeout ? timeout : undefined;
    const controller = hasTimeout ? new AbortController() : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (controller && typeof timeoutMs === 'number') {
      if (timeoutMs <= 0) {
        controller.abort();
      } else {
        timer = setTimeout(() => {
          controller.abort();
        }, timeoutMs);
      }
    }

    try {
      const result = (await this.pool.run(
        task,
        controller ? { signal: controller.signal } : undefined
      )) as WorkerResult;
      return result;
    } catch (error) {
      if (controller?.signal.aborted) {
        return {
          ok: false,
          skips: [],
          error: {
            code: 'TASK_TIMEOUT',
            message:
              typeof timeoutMs === 'number'
                ? `Task timed out after ${timeoutMs}ms.`
                : 'Task timed out.',
            op: task.op
          }
        };
      }

      return {
        ok: false,
        skips: [],
        error: {
          code: 'POOL_RUN_FAILED',
          message: getErrorMessage(error),
          op: task.op
        }
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
