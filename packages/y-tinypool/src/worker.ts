import * as Y from 'yjs';

import type { SkipLog, WorkerTask, WorkerResult } from './types';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export default function run(task: WorkerTask): WorkerResult {
  if (!task || (task.op !== 'merge' && task.op !== 'apply')) {
    return {
      ok: false,
      skips: [],
      error: {
        code: 'INVALID_TASK',
        message: 'Unknown task op. Expected "merge" or "apply".'
      }
    };
  }

  const updates = Array.isArray(task.updates) ? task.updates : [];
  const skipInvalidUpdates = Boolean(task.skipInvalidUpdates);
  const skips: SkipLog[] = [];

  if (task.op === 'merge') {
    try {
      const data = Y.mergeUpdates(updates as Uint8Array[]);
      return {
        ok: true,
        data,
        skips: []
      };
    } catch {
      // Fallback to per-update validation path.
    }

    const accepted: Uint8Array[] = [];

    for (let index = 0; index < updates.length; index += 1) {
      const candidate = updates[index] as Uint8Array;

      try {
        Y.decodeUpdate(candidate);
        accepted.push(candidate);
      } catch (error) {
        const reason = getErrorMessage(error);
        if (!skipInvalidUpdates) {
          return {
            ok: false,
            skips,
            error: {
              code: 'INVALID_UPDATE',
              message: `Invalid update at index ${index}: ${reason}`,
              op: 'merge',
              index
            }
          };
        }

        skips.push({
          op: 'merge',
          index,
          reason
        });
      }
    }

    try {
      const data = Y.mergeUpdates(accepted);
      return {
        ok: true,
        data,
        skips
      };
    } catch (error) {
      return {
        ok: false,
        skips,
        error: {
          code: 'TASK_FAILED',
          message: getErrorMessage(error),
          op: 'merge'
        }
      };
    }
  }

  if (task.op === 'apply') {
    const doc = new Y.Doc();
    for (let index = 0; index < updates.length; index += 1) {
      const candidate = updates[index];

      try {
        Y.applyUpdate(doc, candidate as Uint8Array);
      } catch (error) {
        const reason = getErrorMessage(error);
        if (!skipInvalidUpdates) {
          return {
            ok: false,
            skips,
            error: {
              code: 'INVALID_UPDATE',
              message: `Invalid update at index ${index}: ${reason}`,
              op: 'apply',
              index
            }
          };
        }

        skips.push({
          op: 'apply',
          index,
          reason
        });
      }
    }

    try {
      const data = Y.encodeStateAsUpdate(doc);
      return {
        ok: true,
        data,
        skips
      };
    } catch (error) {
      return {
        ok: false,
        skips,
        error: {
          code: 'TASK_FAILED',
          message: getErrorMessage(error),
          op: 'apply'
        }
      };
    }
  }

  return {
    ok: false,
    skips,
    error: {
      code: 'INVALID_TASK',
      message: 'Unknown task op. Expected "merge" or "apply".'
    }
  };
}
