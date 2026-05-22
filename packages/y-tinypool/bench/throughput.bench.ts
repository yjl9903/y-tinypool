import { availableParallelism, cpus } from 'node:os';

import { afterAll, beforeAll, bench, describe } from 'vitest';
import * as Y from 'yjs';

import { YTinypool } from '../src/index';

const WORKER_COUNT = 4;
const BENCH_OPTIONS = {
  time: 250,
  iterations: 5,
  warmupTime: 100,
  warmupIterations: 3
};
const SERIAL_CASE = {
  label: 'single task',
  updateCount: 1024
};
const CONCURRENT_CASES = [
  {
    label: 'baseline',
    updateCount: 256,
    batchTasks: 16
  },
  {
    label: 'large',
    updateCount: 1024,
    batchTasks: 16
  },
  {
    label: 'xlarge queued',
    updateCount: 4096,
    batchTasks: 32
  }
];

const pool = new YTinypool({
  minThreads: WORKER_COUNT,
  maxThreads: WORKER_COUNT
});

type RuntimePoolStats = {
  options: {
    runtime: string;
    minThreads: number;
    maxThreads: number;
    concurrentTasksPerWorker: number;
    idleTimeout: number;
    useAtomics: boolean;
    maxQueue: number;
  };
  threads: unknown[];
  queueSize: number;
  completed: number;
};

function makeTextUpdates(count: number): Uint8Array[] {
  const doc = new Y.Doc();
  const text = doc.getText('content');
  const result: Uint8Array[] = [];

  doc.on('update', (update: Uint8Array) => {
    result.push(update);
  });

  for (let index = 0; index < count; index += 1) {
    text.insert(text.length, `update-${index.toString().padStart(4, '0')}\n`);
  }

  return result;
}

function getRuntimePoolStats(instance: YTinypool): RuntimePoolStats {
  return (instance as unknown as { pool: RuntimePoolStats }).pool;
}

function getRuntimeConcurrency(stats: RuntimePoolStats): number {
  return stats.options.maxThreads * stats.options.concurrentTasksPerWorker;
}

function mergeOnMainThread(input: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(input);
}

function applyOnMainThread(input: Uint8Array[]): Uint8Array {
  const doc = new Y.Doc();

  for (const update of input) {
    Y.applyUpdate(doc, update);
  }

  return Y.encodeStateAsUpdate(doc);
}

function getTextFromUpdate(update: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc.getText('content').toString();
}

async function mergeWithPool(input: Uint8Array[]): Promise<Uint8Array> {
  const result = await pool.mergeUpdates(input);

  if (!result.ok) {
    throw new Error(`y-tinypool merge failed: ${result.error.message}`);
  }

  return result.update;
}

async function applyWithPool(input: Uint8Array[]): Promise<Uint8Array> {
  const result = await pool.applyUpdates(input);

  if (!result.ok) {
    throw new Error(`y-tinypool apply failed: ${result.error.message}`);
  }

  return result.update;
}

beforeAll(async () => {
  const casesToValidate = [SERIAL_CASE, ...CONCURRENT_CASES];

  for (const benchCase of casesToValidate) {
    const updates = makeTextUpdates(benchCase.updateCount);
    const expected = getTextFromUpdate(applyOnMainThread(updates));

    const [pooledMerge, pooledApply] = await Promise.all([
      mergeWithPool(updates),
      applyWithPool(updates)
    ]);

    if (getTextFromUpdate(pooledMerge) !== expected) {
      throw new Error('y-tinypool merge benchmark output does not match main thread Yjs output');
    }
    if (getTextFromUpdate(pooledApply) !== expected) {
      throw new Error('y-tinypool apply benchmark output does not match main thread Yjs output');
    }
  }

  const stats = getRuntimePoolStats(pool);
  console.info('benchmark runtime:', {
    availableParallelism: availableParallelism(),
    cpus: cpus().length,
    pool: {
      runtime: stats.options.runtime,
      minThreads: stats.options.minThreads,
      maxThreads: stats.options.maxThreads,
      concurrentTasksPerWorker: stats.options.concurrentTasksPerWorker,
      runtimeConcurrency: getRuntimeConcurrency(stats),
      spawnedThreads: stats.threads.length,
      queueSize: stats.queueSize,
      completedWarmupTasks: stats.completed,
      idleTimeout: stats.options.idleTimeout,
      useAtomics: stats.options.useAtomics,
      maxQueue: stats.options.maxQueue
    }
  });
});

afterAll(async () => {
  await pool.destroy();
});

const serialUpdates = makeTextUpdates(SERIAL_CASE.updateCount);

describe(`Yjs single-task reference (${SERIAL_CASE.label}: ${SERIAL_CASE.updateCount} updates/task)`, () => {
  bench(
    'main thread: mergeUpdates',
    () => {
      mergeOnMainThread(serialUpdates);
    },
    BENCH_OPTIONS
  );

  bench(
    'y-tinypool: mergeUpdates',
    async () => {
      await mergeWithPool(serialUpdates);
    },
    BENCH_OPTIONS
  );

  bench(
    'main thread: apply updates',
    () => {
      applyOnMainThread(serialUpdates);
    },
    BENCH_OPTIONS
  );

  bench(
    'y-tinypool: applyUpdates',
    async () => {
      await applyWithPool(serialUpdates);
    },
    BENCH_OPTIONS
  );
});

for (const benchCase of CONCURRENT_CASES) {
  const updates = makeTextUpdates(benchCase.updateCount);

  describe(`Yjs concurrent throughput (${benchCase.label}: ${benchCase.batchTasks} tasks/batch, ${benchCase.updateCount} updates/task)`, () => {
    bench(
      'main thread: mergeUpdates batch',
      () => {
        for (let index = 0; index < benchCase.batchTasks; index += 1) {
          mergeOnMainThread(updates);
        }
      },
      BENCH_OPTIONS
    );

    bench(
      'y-tinypool: mergeUpdates concurrent batch',
      async () => {
        await Promise.all(
          Array.from({ length: benchCase.batchTasks }, () => mergeWithPool(updates))
        );
      },
      BENCH_OPTIONS
    );

    bench(
      'main thread: apply updates batch',
      () => {
        for (let index = 0; index < benchCase.batchTasks; index += 1) {
          applyOnMainThread(updates);
        }
      },
      BENCH_OPTIONS
    );

    bench(
      'y-tinypool: applyUpdates concurrent batch',
      async () => {
        await Promise.all(
          Array.from({ length: benchCase.batchTasks }, () => applyWithPool(updates))
        );
      },
      BENCH_OPTIONS
    );
  });
}
