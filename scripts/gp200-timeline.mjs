#!/usr/bin/env node
/**
 * Chronological GP-200 SysEx timeline with direction + timestamps.
 *
 * decode-sysex-capture.mjs groups messages by (cmd, sub, len), which is right
 * for working out a field layout but loses the two things needed to find a
 * write sequence: who sent it, and when. This keeps both, so a capture can be
 * read as "the editor sent X, waited 300ms, then sent Y".
 *
 * Wireshark dissects USB-MIDI into `usbaudio.midi.event` fields (the 1-3 MIDI
 * bytes per 4-byte USB event), so the SysEx stream is just those in order.
 *
 * Usage:
 *   node scripts/gp200-timeline.mjs <capture.pcapng> [--out-only] [--nibble]
 *     --out-only   only host->device messages
 *     --nibble     also print the nibble-decoded payload + ASCII
 *     --device N   USB device address (default: auto-detect by GP-200 VID)
 */
import { execFileSync } from 'node:child_process';

const GP_HEADER = [0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32];

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const outOnly = args.includes('--out-only');
const showNibble = args.includes('--nibble');
const devIndex = args.indexOf('--device');
let device = devIndex === -1 ? null : args[devIndex + 1];
if (!file) {
  console.error('usage: node scripts/gp200-timeline.mjs <capture.pcapng> [--out-only] [--nibble] [--device N]');
  process.exit(1);
}

function tshark(tsharkArgs) {
  return execFileSync('tshark', tsharkArgs, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
}

if (device === null) {
  const found = tshark(['-r', file, '-Y', 'usb.idVendor==0x84ef', '-T', 'fields', '-e', 'usb.device_address'])
    .split('\n').map((l) => l.trim()).filter(Boolean);
  device = found[0];
  if (!device) {
    console.error('Could not auto-detect the GP-200 device address; pass --device N');
    process.exit(1);
  }
}

const filter = `usb.transfer_type==3 && usb.device_address==${device}`;
const raw = tshark([
  '-r', file,
  '-Y', filter,
  '-T', 'fields',
  '-e', 'frame.number',
  '-e', 'frame.time_relative',
  '-e', 'usb.endpoint_address.direction',
  '-e', 'usbaudio.midi.event',
  '-E', 'occurrence=a',
  '-E', 'aggregator=,',
]);

const buffers = { 0: [], 1: [] };
const started = { 0: null, 1: null };
const messages = [];

for (const line of raw.split('\n')) {
  const parts = line.replace(/\r$/, '').split('\t');
  if (parts.length < 4) continue;
  const [frameNo, timeRel, dirField, events] = parts;
  if (!events) continue;
  const dir = dirField === '1' ? 1 : 0;

  const stream = [];
  for (const chunk of events.split(',')) {
    const clean = chunk.trim();
    for (let i = 0; i + 1 < clean.length; i += 2) {
      stream.push(parseInt(clean.slice(i, i + 2), 16));
    }
  }

  for (const byte of stream) {
    if (byte === 0xF0) {
      buffers[dir] = [0xF0];
      started[dir] = { frameNo, timeRel };
      continue;
    }
    if (buffers[dir].length === 0) continue;
    buffers[dir].push(byte);
    if (byte === 0xF7) {
      const msg = buffers[dir];
      buffers[dir] = [];
      if (GP_HEADER.every((b, k) => msg[k] === b)) {
        messages.push({
          frameNo: started[dir].frameNo,
          time: Number(started[dir].timeRel),
          dir,
          cmd: msg[8],
          sub: msg[9],
          len: msg.length,
          bytes: msg,
        });
      }
    }
  }
}

messages.sort((a, b) => a.time - b.time);

function nibbleDecode(bytes) {
  const out = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) out.push((bytes[i] << 4) | bytes[i + 1]);
  return out;
}
const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');

let prev = null;
for (const m of messages) {
  if (outOnly && m.dir !== 0) continue;
  const gap = prev === null ? 0 : m.time - prev;
  prev = m.time;
  const arrow = m.dir === 0 ? 'HOST->DEV' : 'DEV->HOST';
  const cmd = m.cmd.toString(16).padStart(2, '0');
  const sub = m.sub.toString(16).padStart(2, '0');
  console.log(`[${m.time.toFixed(3)}s +${gap.toFixed(3)}] ${arrow} ${cmd}/${sub} len=${m.len} frame=${m.frameNo}`);
  if (showNibble) {
    const decoded = nibbleDecode(m.bytes.slice(13, m.bytes.length - 1));
    console.log(`    raw[10:28]: ${hex(m.bytes.slice(10, 28))}`);
    console.log(`    payload   : ${hex(decoded.slice(0, 32))}`);
    const ascii = decoded.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    if (/[A-Za-z0-9]{3}/.test(ascii)) console.log(`    ascii     : ${ascii.slice(0, 64)}`);
  }
}
const hostCount = messages.filter((m) => m.dir === 0).length;
console.log(`\ndevice ${device}: ${messages.length} GP-200 messages (${hostCount} host->device)`);
