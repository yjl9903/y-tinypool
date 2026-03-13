import * as Y from 'yjs';

import { YTinypool } from '../packages/y-tinypool/dist/index.cjs';

function makeUpdatesWithInvalidOne(): Uint8Array[] {
  const updates: Uint8Array[] = [];
  const doc = new Y.Doc();

  doc.on('update', (update: Uint8Array) => {
    updates.push(update);
  });

  const text = doc.getText('content');
  text.insert(0, 'A');
  text.insert(1, 'B');
  text.insert(2, 'C');

  return [updates[0], Uint8Array.from([1, 2, 3]), updates[1], updates[2]];
}

async function main() {
  const pool = new YTinypool({ skipInvalidUpdates: true });

  try {
    const applyResult = await pool.applyUpdates(makeUpdatesWithInvalidOne());
    if (!applyResult.ok) {
      console.error('apply failed:', applyResult.error);
      return;
    }

    const doc = new Y.Doc();
    Y.applyUpdate(doc, applyResult.update);
    console.log('apply text:', doc.getText('content').toString());
    console.log('skip logs:', applyResult.skips);

    const timeoutResult = await pool.mergeUpdates([applyResult.update], { timeout: 1 });
    if (!timeoutResult.ok) {
      console.error('timeout error:', timeoutResult.error);
      return;
    }

    console.log('unexpected timeout success:', timeoutResult.update.length);
  } finally {
    await pool.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
