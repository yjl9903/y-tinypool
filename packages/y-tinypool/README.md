# y-tinypool

[![npm version](https://img.shields.io/npm/v/y-tinypool)](https://www.npmjs.com/package/y-tinypool)
[![npm downloads](https://img.shields.io/npm/dm/y-tinypool)](https://www.npmjs.com/package/y-tinypool)
[![CI](https://github.com/yjl9903/y-tinypool/actions/workflows/ci.yml/badge.svg)](https://github.com/yjl9903/y-tinypool/actions/workflows/ci.yml)

Run Yjs update operations (`merge` / `apply`) in `tinypool` worker threads.

- Parallel Yjs binary update processing with `worker_threads`
- `mergeUpdates(updates)` for fast update merging
- `applyUpdates(updates)` for producing final update after sequential apply
- Structured error result (`ok: false`) with optional `skipInvalidUpdates` and `timeout`

## Install

```bash
npm i y-tinypool
```

## Usage

```ts
import * as Y from 'yjs';
import { YTinypool } from 'y-tinypool';

const pool = new YTinypool();

const updates: Uint8Array[] = [];
const source = new Y.Doc();
source.on('update', (u: Uint8Array) => updates.push(u));

const text = source.getText('content');
text.insert(0, 'Hello');
text.insert(5, ' Tiny');
text.insert(10, 'pool');

const merged = await pool.mergeUpdates(updates);
if (merged.ok) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, merged.update);
  console.log(doc.getText('content').toString()); // Hello Tinypool
} else {
  console.error(merged.error);
}

await pool.destroy();
```

```ts
import * as Y from 'yjs';
import { YTinypool } from 'y-tinypool';

const pool = new YTinypool({ skipInvalidUpdates: true });

const updates: Uint8Array[] = [
  Uint8Array.from([1, 2, 3]) // invalid sample
  // ...valid updates
];

const applied = await pool.applyUpdates(updates, { timeout: 1000 });
if (applied.ok) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, applied.update);
  console.log('skip logs:', applied.skips);
} else {
  console.error(applied.error);
}

await pool.destroy();
```

## Benchmark

```bash
pnpm --filter y-tinypool bench
```

Local run on a MacBook Pro with Apple M3 Pro and 18GB memory. Node.js reported
`availableParallelism=12` and `cpus=12`; the benchmark used a 4-worker `worker_threads`
pool (`minThreads=4`, `maxThreads=4`, effective concurrency `4`):

In the workload column, `tasks` is the number of independent Yjs jobs submitted together,
and `updates` is the number of Yjs updates processed by each job.

`mergeUpdates`:

| Workload                  |      Main thread |       y-tinypool | Speedup | y-tinypool task throughput |
| ------------------------- | ---------------: | ---------------: | ------: | -------------------------: |
| `16 tasks x 256 updates`  | 115.33 batches/s | 278.85 batches/s |   2.42x |           4,461.60 tasks/s |
| `16 tasks x 1024 updates` |   6.93 batches/s |  18.82 batches/s |   2.72x |             301.06 tasks/s |
| `32 tasks x 4096 updates` |   0.23 batches/s |   0.88 batches/s |   3.75x |              28.05 tasks/s |

`applyUpdates`:

| Workload                  |      Main thread |       y-tinypool | Speedup | y-tinypool task throughput |
| ------------------------- | ---------------: | ---------------: | ------: | -------------------------: |
| `16 tasks x 256 updates`  | 144.31 batches/s | 397.63 batches/s |   2.76x |           6,362.08 tasks/s |
| `16 tasks x 1024 updates` |  41.35 batches/s | 122.68 batches/s |   2.97x |           1,962.88 tasks/s |
| `32 tasks x 4096 updates` |   5.07 batches/s |  15.81 batches/s |   3.12x |             505.97 tasks/s |

Single-task Yjs operations are still faster on the main thread because worker handoff
dominates. `y-tinypool` helps when many independent Yjs update jobs run concurrently; in
this run, concurrent batches were about `2.4x` to `3.8x` faster.

## License

MIT License © 2026 [XLor](https://github.com/yjl9903)
