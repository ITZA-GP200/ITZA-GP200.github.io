import { SysExCodec } from './SysExCodec';

/**
 * Collecting a slot read's reply (0x12/0x18 chunks) from an input stream that
 * can also carry the tail of an EARLIER read.
 *
 * Replies aren't tagged with the request they answer, and a read that timed
 * out keeps receiving chunks after the next read has started. Counting "any 7
 * chunks" then mixes two patches into one: parses fail (names shown as "?")
 * or, worse, return a hybrid. Two facts make a reply identifiable:
 *   - every reply starts at chunk offset 0, so chunks seen before an offset-0
 *     chunk belong to someone else's reply;
 *   - the patch names its own slot at decoded[6:8] (u16 LE), which the first
 *     chunk already carries (dumps/official-write: slot 4 and slot 156).
 */

/** Chunks in one full slot read reply (6 × 185 decoded bytes + 1 × 66). */
export const READ_REPLY_CHUNKS = 7;

/** Offset a read-reply chunk sits at within its reply. */
function chunkOffset(chunk: Uint8Array): number {
  return chunk[11] | (chunk[12] << 8);
}

/** The slot a read reply belongs to, from its offset-0 chunk alone. */
export function slotOfFirstReplyChunk(chunk: Uint8Array): number {
  const head = SysExCodec.nibbleDecode(chunk.slice(13, chunk.length - 1));
  return head[6] | (head[7] << 8);
}

/** Whether `chunk` is the first chunk of a reply for `slot`. */
export function isFirstReplyChunkFor(chunk: Uint8Array, slot: number): boolean {
  return chunkOffset(chunk) === 0 && slotOfFirstReplyChunk(chunk) === slot;
}

export type ReadReplyResult =
  | { kind: 'waiting' }
  | { kind: 'complete'; chunks: Uint8Array[] }
  | { kind: 'foreign'; slot: number };

/**
 * Accumulates one reply for `slot`. Feed it every 0x12/0x18 chunk; it ignores
 * stray tails, restarts on each offset-0 chunk, and only reports `complete`
 * for a whole reply that names the requested slot.
 */
export function createReadReplyCollector(slot: number) {
  let chunks: Uint8Array[] = [];
  return {
    accept(chunk: Uint8Array): ReadReplyResult {
      if (chunkOffset(chunk) === 0) {
        chunks = [];
      } else if (chunks.length === 0) {
        return { kind: 'waiting' }; // tail of an earlier reply
      }
      chunks.push(chunk);
      if (chunks.length < READ_REPLY_CHUNKS) return { kind: 'waiting' };
      const reply = chunks;
      chunks = [];
      const replySlot = slotOfFirstReplyChunk(reply[0]);
      if (replySlot !== slot) return { kind: 'foreign', slot: replySlot };
      return { kind: 'complete', chunks: reply };
    },
    reset(): void {
      chunks = [];
    },
  };
}
