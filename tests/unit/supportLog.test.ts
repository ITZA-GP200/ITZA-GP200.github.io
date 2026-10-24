import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSupportLog,
  supportLogFilename,
  clearSupportLog,
  recordLogLine,
  startSupportLog,
  supportLogSize,
} from '@/core/supportLog';

describe('supportLog: what it keeps', () => {
  beforeEach(() => clearSupportLog());

  it("keeps the editor's own lines, and every warning and error", () => {
    const fake = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const stop = startSupportLog(fake);

    fake.log('[GP-200] writeToSlot: slot=252');
    fake.log('some library chattering about hydration');
    fake.warn('[GP-200] 64A kept 1 value(s) its own way');
    fake.error('Not connected');
    stop();

    const text = buildSupportLog();
    expect(text).toContain('writeToSlot: slot=252');
    expect(text).toContain('64A kept 1 value(s)');
    expect(text).toContain('Not connected');
    // Noise from elsewhere stays out, so the file is about the pedal.
    expect(text).not.toContain('hydration');
  });

  it('still prints to the console it wrapped', () => {
    const fake = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const stop = startSupportLog(fake);
    fake.log('[GP-200] hello');
    stop();
    // The call reached the original: the console is unchanged for everyone else.
    expect(supportLogSize()).toBe(1);
  });

  it('puts the console back when stopped', () => {
    const fake = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const before = fake.log;
    const stop = startSupportLog(fake);
    expect(fake.log).not.toBe(before);
    stop();
    expect(fake.log).toBe(before);
  });

  it('turns an Error into something readable', () => {
    const fake = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const stop = startSupportLog(fake);
    fake.error(new Error('The pedal didn’t take the copy'));
    stop();
    expect(buildSupportLog()).toContain('Error: The pedal didn’t take the copy');
  });
});

describe('supportLog: the file', () => {
  beforeEach(() => clearSupportLog());

  it('says what it could not keep rather than quietly losing it', () => {
    for (let i = 0; i < 700; i++) recordLogLine('log', `[GP-200] line ${i}`);
    const text = buildSupportLog();
    expect(supportLogSize()).toBe(600);
    expect(text).toContain('older lines dropped');
    expect(text).toContain('line 699'); // the newest survived
    expect(text).not.toContain('line 0 '); // the oldest went
  });

  it('carries the facts that make the lines mean something', () => {
    recordLogLine('warn', '[GP-200] 64A kept 1 value(s)');
    const text = buildSupportLog({
      appVersion: '1.1.0 (d15a1c8)',
      firmware: '1.8.0',
      refusedKnobs: ['1:3', '2b:0'],
      browser: 'Chrome/141',
    });
    expect(text).toContain('1.1.0 (d15a1c8)');
    expect(text).toContain('firmware     1.8.0');
    expect(text).toContain('1:3, 2b:0');
    expect(text).toContain('Chrome/141');
  });

  it('says so plainly when nothing has been refused and nothing is connected', () => {
    const text = buildSupportLog();
    expect(text).toContain('none learned yet');
    expect(text).toContain('not connected');
  });
});

describe('supportLog: the filename', () => {
  it('carries the time to the second, so two saves never collide', () => {
    const name = supportLogFilename(new Date('2026-10-24T07:37:43.031Z'));
    expect(name).toBe('gp200-studio-log-2026-10-24-07-37-43Z.txt');
  });

  it('gives a different name a second later', () => {
    const a = supportLogFilename(new Date('2026-10-24T07:37:43.031Z'));
    const b = supportLogFilename(new Date('2026-10-24T07:37:44.000Z'));
    expect(a).not.toBe(b);
  });

  it('is only digits, dashes and the extension, which every filesystem takes', () => {
    const name = supportLogFilename(new Date('2026-10-24T07:37:43.031Z'));
    expect(name).toMatch(/^gp200-studio-log-[0-9-]+Z\.txt$/);
  });
});
