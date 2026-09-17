import { describe, expect, it } from 'vitest';
import { SysExCodec } from '@/core/SysExCodec';
import {
  READ_REPLY_CHUNKS,
  createReadReplyCollector,
  isFirstReplyChunkFor,
  slotOfFirstReplyChunk,
} from '@/core/readReply';

/**
 * A reply shaped like the pedal's (dumps/official-write): a 1176-byte patch
 * with its slot at [6:8] and name at [28:44], nibble-encoded into 7 chunks of
 * 185 decoded bytes, header byte [10] = 0x09, offset at [11..12].
 */
function reply(slot: number, name: string): Uint8Array[] {
  const decoded = new Uint8Array(1176);
  decoded[6] = slot & 0xFF;
  decoded[7] = (slot >> 8) & 0xFF;
  for (let i = 0; i < name.length; i++) decoded[28 + i] = name.charCodeAt(i);
  const chunks: Uint8Array[] = [];
  for (let off = 0; off < decoded.length; off += 185) {
    const nibbles = SysExCodec.nibbleEncode(decoded.subarray(off, Math.min(off + 185, decoded.length)));
    const msg = new Uint8Array(13 + nibbles.length + 1);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x18, 0x09]);
    msg[11] = off & 0x7F;
    msg[12] = (off >> 7) & 0x7F;
    msg.set(nibbles, 13);
    msg[msg.length - 1] = 0xF7;
    chunks.push(msg);
  }
  return chunks;
}

describe('read reply identification', () => {
  it('builds replies the same size as the pedal sends', () => {
    expect(reply(4, 'BE MY FIRE 1')).toHaveLength(READ_REPLY_CHUNKS);
  });

  it('reads the slot from the first chunk alone, including high slots', () => {
    expect(slotOfFirstReplyChunk(reply(4, 'X')[0])).toBe(4);
    expect(slotOfFirstReplyChunk(reply(156, 'X')[0])).toBe(156);
  });

  it('recognises only the first chunk of the requested slot', () => {
    const chunks = reply(156, 'X');
    expect(isFirstReplyChunkFor(chunks[0], 156)).toBe(true);
    expect(isFirstReplyChunkFor(chunks[0], 4)).toBe(false);
    expect(isFirstReplyChunkFor(chunks[1], 156)).toBe(false);
  });
});

describe('createReadReplyCollector', () => {
  it('completes on a clean reply for its slot', () => {
    const collector = createReadReplyCollector(4);
    const chunks = reply(4, 'BE MY FIRE 1');
    const results = chunks.map((chunk) => collector.accept(chunk));
    expect(results.slice(0, 6).every((r) => r.kind === 'waiting')).toBe(true);
    const last = results[6];
    expect(last.kind).toBe('complete');
    if (last.kind === 'complete') {
      expect(SysExCodec.parseReadChunks(last.chunks).patchName).toBe('BE MY FIRE 1');
    }
  });

  it('ignores the tail of an earlier reply that arrives first', () => {
    // The bug: a timed-out read's last chunks landed in the next read.
    const collector = createReadReplyCollector(4);
    const stale = reply(3, 'Spicy Bass').slice(2); // offsets 370.. of slot 3
    for (const chunk of stale) expect(collector.accept(chunk).kind).toBe('waiting');
    const results = reply(4, 'BE MY FIRE 1').map((chunk) => collector.accept(chunk));
    const last = results[results.length - 1];
    expect(last.kind).toBe('complete');
    if (last.kind === 'complete') {
      expect(SysExCodec.parseReadChunks(last.chunks).patchName).toBe('BE MY FIRE 1');
    }
  });

  it('reports a whole reply for another slot as foreign instead of accepting it', () => {
    const collector = createReadReplyCollector(4);
    const results = reply(7, 'Durango').map((chunk) => collector.accept(chunk));
    expect(results[results.length - 1]).toEqual({ kind: 'foreign', slot: 7 });
  });

  it('restarts cleanly when a new reply begins mid-collection', () => {
    const collector = createReadReplyCollector(4);
    const interrupted = reply(4, 'Old').slice(0, 3);
    for (const chunk of interrupted) collector.accept(chunk);
    const results = reply(4, 'BE MY FIRE 1').map((chunk) => collector.accept(chunk));
    const last = results[results.length - 1];
    expect(last.kind).toBe('complete');
    if (last.kind === 'complete') {
      expect(SysExCodec.parseReadChunks(last.chunks).patchName).toBe('BE MY FIRE 1');
    }
  });
});
