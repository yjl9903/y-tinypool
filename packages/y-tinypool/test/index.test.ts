import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { YTinypool } from '../src/index';

function makeIncrementalUpdates(): Uint8Array[] {
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

function createDocFromUpdate(update: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc;
}

describe('YTinypool', () => {
  it('merges updates in worker threads', async () => {
    const updates = makeIncrementalUpdates();
    const pool = new YTinypool();

    try {
      const result = await pool.mergeUpdates(updates);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const mergedDoc = createDocFromUpdate(result.update);

      expect(result.skips).toEqual([]);
      expect(mergedDoc.getText('content').toString()).toBe('Hello Tinypool');
      expect(Array.from(result.update)).toEqual(Array.from(Y.mergeUpdates(updates)));
    } finally {
      await pool.destroy();
    }
  });

  it('applies updates and returns state update', async () => {
    const updates = makeIncrementalUpdates();
    const pool = new YTinypool();

    try {
      const result = await pool.applyUpdates(updates);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const doc = createDocFromUpdate(result.update);

      expect(result.skips).toEqual([]);
      expect(doc.getText('content').toString()).toBe('Hello Tinypool');
    } finally {
      await pool.destroy();
    }
  });

  it('returns error result when invalid update is found and skip is disabled', async () => {
    const updates = makeIncrementalUpdates();
    const pool = new YTinypool();
    const invalid = Uint8Array.from([1, 2, 3, 4]);

    try {
      const result = await pool.mergeUpdates([updates[0], invalid, updates[1]]);
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.code).toBe('INVALID_UPDATE');
      expect(result.error.index).toBe(1);
      expect(result.error.message).toMatch(/index 1/i);
    } finally {
      await pool.destroy();
    }
  });

  it('skips invalid updates when configured and returns skipped indices', async () => {
    const updates = makeIncrementalUpdates();
    const pool = new YTinypool({ skipInvalidUpdates: true });
    const invalid = Uint8Array.from([9, 9, 9]);

    try {
      const result = await pool.applyUpdates([updates[0], invalid, updates[1], updates[2]]);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const doc = createDocFromUpdate(result.update);

      expect(result.skips).toHaveLength(1);
      expect(result.skips[0].index).toBe(1);
      expect(result.skips[0].op).toBe('apply');
      expect(result.skips[0].reason.length).toBeGreaterThan(0);
      expect(doc.getText('content').toString()).toBe('Hello Tinypool');
    } finally {
      await pool.destroy();
    }
  });

  it('handles empty updates', async () => {
    const pool = new YTinypool();

    try {
      const merged = await pool.mergeUpdates([]);
      const applied = await pool.applyUpdates([]);

      expect(merged.ok).toBe(true);
      expect(applied.ok).toBe(true);
      if (!merged.ok || !applied.ok) {
        return;
      }
      expect(Array.from(merged.update)).toEqual([0, 0]);
      expect(Array.from(applied.update)).toEqual([0, 0]);
      expect(merged.skips).toEqual([]);
      expect(applied.skips).toEqual([]);
    } finally {
      await pool.destroy();
    }
  });

  it('returns error result if called after destroy', async () => {
    const pool = new YTinypool();
    await pool.destroy();

    const result = await pool.mergeUpdates([]);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('POOL_DESTROYED');
    expect(result.error.message).toMatch(/destroyed/i);
  });

  it('returns timeout error when execution exceeds timeout', async () => {
    const updates = makeIncrementalUpdates();
    const pool = new YTinypool();

    try {
      const result = await pool.mergeUpdates(updates, { timeout: 0 });
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.code).toBe('TASK_TIMEOUT');
    } finally {
      await pool.destroy();
    }
  });

  it('transfers input updates when transfer is enabled', async () => {
    const updates = makeIncrementalUpdates();
    const pool = new YTinypool();

    try {
      const result = await pool.mergeUpdates(updates, { transfer: true });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(updates.every((update) => update.byteLength === 0)).toBe(true);
      expect(result.update.byteLength).toBeGreaterThan(0);
    } finally {
      await pool.destroy();
    }
  });

  it('returns deterministic results under concurrent calls', async () => {
    const updates = makeIncrementalUpdates();
    const pool = new YTinypool();

    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => pool.applyUpdates(updates))
      );
      const outputs = results.map((result) => {
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return [];
        }
        return Array.from(result.update);
      });

      for (const output of outputs) {
        expect(output).toEqual(outputs[0]);
      }
    } finally {
      await pool.destroy();
    }
  });
});
