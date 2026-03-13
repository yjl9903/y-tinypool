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
  Uint8Array.from([1, 2, 3]), // invalid sample
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

## License

MIT License © 2026 [XLor](https://github.com/yjl9903)
