#!/usr/bin/env node
/**
 * Reassemble one slot's patch out of a capture's read responses.
 *
 * Used to check a field seen in a write message against the patch's real
 * stored values (e.g. "is the 0x5a in the save record the patch volume?").
 * Device->host read chunks carry the slot at wire[10] and a 7-bit offset at
 * wire[11..12], so they can be grouped without replaying the requests.
 *
 * Usage: node scripts/gp200-slot-from-capture.mjs <capture.pcapng> <slot>
 */
import { execFileSync } from 'node:child_process';

const [file, slotArg] = process.argv.slice(2);
if (!file || slotArg === undefined) {
  console.error('usage: node scripts/gp200-slot-from-capture.mjs <capture.pcapng> <slot>');
  process.exit(1);
}
const wantSlot = Number(slotArg);

const device = execFileSync('tshark', [
  '-r', file, '-Y', 'usb.idVendor==0x84ef', '-T', 'fields', '-e', 'usb.device_address',
], { encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean)[0];

const raw = execFileSync('tshark', [
  '-r', file,
  '-Y', `usb.transfer_type==3 && usb.device_address==${device} && usb.endpoint_address.direction==1`,
  '-T', 'fields',
  '-e', 'usbaudio.midi.event',
  '-E', 'occurrence=a',
  '-E', 'aggregator=,',
], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });

const chunks = [];
let buf = [];
for (const line of raw.split('\n')) {
  const events = line.trim();
  if (!events) continue;
  const stream = [];
  for (const chunk of events.split(',')) {
    const clean = chunk.trim();
    for (let i = 0; i + 1 < clean.length; i += 2) stream.push(parseInt(clean.slice(i, i + 2), 16));
  }
  for (const byte of stream) {
    if (byte === 0xF0) { buf = [0xF0]; continue; }
    if (buf.length === 0) continue;
    buf.push(byte);
    if (byte === 0xF7) {
      const msg = buf;
      buf = [];
      if (msg[8] === 0x12 && msg[9] === 0x18 && msg.length > 100) {
        chunks.push({ offset: msg[11] | (msg[12] << 7), nibbles: msg.slice(13, msg.length - 1) });
      }
    }
  }
}

/** Chunks arrive per slot in offset order, so an offset of 0 starts a patch. */
function assemble(group) {
  const allNibbles = [];
  for (const c of group) allNibbles.push(...c.nibbles);
  const out = [];
  for (let i = 0; i + 1 < allNibbles.length; i += 2) out.push((allNibbles[i] << 4) | allNibbles[i + 1]);
  return out;
}

const patches = [];
let group = [];
for (const c of chunks) {
  if (c.offset === 0 && group.length > 0) {
    patches.push(assemble(group));
    group = [];
  }
  group.push(c);
}
if (group.length > 0) patches.push(assemble(group));

// The patch carries its own slot at decoded[6:8] (see buildDecodedPreset in
// tests/unit/SysExCodec.test.ts), which is what identifies it, not the header.
const decoded = patches.find((d) => (d[6] | (d[7] << 8)) === wantSlot);
if (!decoded) {
  console.error(`No read response for slot ${wantSlot} (parsed ${patches.length} patches)`);
  process.exit(2);
}

const name = [];
for (let i = 28; i < 44 && decoded[i]; i++) name.push(String.fromCharCode(decoded[i]));

console.log(`slot ${wantSlot}: ${chunks.length} chunks, ${decoded.length} decoded bytes`);
console.log(`  name          "${name.join('')}"`);
console.log(`  patchTempo    ${decoded[14] | (decoded[15] << 8)}`);
console.log(`  patchVolume   ${decoded[16]}   (0x${(decoded[16] ?? 0).toString(16)})`);
console.log(`  patchPan      ${decoded[18] | (decoded[19] << 8)}`);
console.log(`  patchStyle    ${decoded[20] | (decoded[21] << 8)}   (0x${((decoded[20] | (decoded[21] << 8)) ?? 0).toString(16)})`);
console.log(`  bytes[12:24]  ${decoded.slice(12, 24).map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
