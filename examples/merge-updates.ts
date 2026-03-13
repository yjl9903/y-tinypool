import * as Y from 'yjs';

import { YTinypool } from '../packages/y-tinypool/dist/index.cjs';

function makeUpdates(): Uint8Array[] {
  const updates: Uint8Array[] = [];
  const doc = new Y.Doc();

  doc.on('update', (update: Uint8Array) => {
    updates.push(update);
  });

  const text = doc.getText('content');
  text.insert(0, 'Hello');
  text.insert(5, ' Tiny');
  text.insert(10, 'pool');

  return updates;
}

async function main() {
  const pool = new YTinypool();

  try {
    const updates = makeUpdates();
    const result = await pool.mergeUpdates(updates);

    if (!result.ok) {
      console.error('merge failed:', result.error);
      return;
    }

    const doc = new Y.Doc();
    Y.applyUpdate(doc, result.update);

    console.log('merged text:', doc.getText('content').toString());
    console.log('skip logs:', result.skips);
  } finally {
    await pool.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
