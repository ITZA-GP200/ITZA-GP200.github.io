/**
 * A log someone can send us when something goes wrong.
 *
 * The editor already narrates what it does to the pedal through `console`
 * ("[GP-200] writeToSlot: slot=252…", "[GP-200] 64A kept 3 value(s)…"). That
 * is everything support needs, and until now the only way to read it back was
 * to talk somebody through opening DevTools. So the same lines are kept here
 * too, in a ring buffer, and SAVE LOG writes them to a file.
 *
 * What is kept: the editor's own [GP-200] lines, and every warning and error
 * whatever its source (a failure we didn't anticipate won't be wearing our
 * prefix). Ordinary console.log from elsewhere is ignored, so the file stays
 * about the pedal.
 *
 * What is in it: timings, slots, and patch names — the names are the point,
 * since "64A didn't take it" means nothing without them. Nothing is sent
 * anywhere; the file is written only when someone presses the button.
 */

export interface LogLine {
  /** Milliseconds since the log started, so a file shows pacing, not clock time. */
  at: number;
  level: 'log' | 'warn' | 'error';
  text: string;
}

/** Enough to cover a full bank-64 restore with room to spare. */
const MAX_LINES = 600;

const lines: LogLine[] = [];
let startedAt = Date.now();
/** Lines dropped off the front, so a long session says so rather than lying. */
let dropped = 0;

const OURS = '[GP-200]';

function text(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

export function recordLogLine(level: LogLine['level'], line: string): void {
  lines.push({ at: Date.now() - startedAt, level, text: line });
  if (lines.length > MAX_LINES) {
    lines.shift();
    dropped += 1;
  }
}

/**
 * Start copying console output into the log. Returns the function that puts
 * `console` back, which the tests use; the app starts it once and leaves it.
 */
export function startSupportLog(target: Pick<Console, 'log' | 'warn' | 'error'> = console): () => void {
  const original = { log: target.log, warn: target.warn, error: target.error };

  const wrap = (level: LogLine['level']) => (...args: unknown[]) => {
    const line = text(args);
    // Warnings and errors always; plain logs only when they are ours.
    if (level !== 'log' || line.startsWith(OURS)) recordLogLine(level, line);
    original[level].apply(target, args as never[]);
  };

  target.log = wrap('log');
  target.warn = wrap('warn');
  target.error = wrap('error');

  return () => {
    target.log = original.log;
    target.warn = original.warn;
    target.error = original.error;
  };
}

/** Facts about this session that make the lines readable. */
export interface SupportLogContext {
  appVersion?: string | null;
  firmware?: string | null;
  /** Controls this pedal has refused (see stubbornValues). */
  refusedKnobs?: string[];
  browser?: string | null;
}

const stamp = (ms: number) => {
  const total = Math.round(ms / 100) / 10;
  return `${total.toFixed(1)}s`.padStart(8);
};

/** The file's contents: a short header, then every line kept. */
export function buildSupportLog(context: SupportLogContext = {}): string {
  const head = [
    'GP200 Studio PM — support log',
    `written      ${new Date().toISOString()}`,
    `app          ${context.appVersion ?? 'unknown'}`,
    `firmware     ${context.firmware ?? 'not connected'}`,
    `browser      ${context.browser ?? 'unknown'}`,
    `knobs this pedal refuses: ${
      context.refusedKnobs && context.refusedKnobs.length > 0 ? context.refusedKnobs.join(', ') : 'none learned yet'
    }`,
    `lines        ${lines.length}${dropped > 0 ? ` (${dropped} older lines dropped)` : ''}`,
    '',
    'Times are seconds since this page was opened. Patch names appear below.',
    '─'.repeat(72),
  ];
  const body = lines.map((line) => {
    const level = line.level === 'log' ? '    ' : line.level === 'warn' ? 'WARN' : 'ERR ';
    return `${stamp(line.at)}  ${level}  ${line.text}`;
  });
  return [...head, ...body, ''].join('\n');
}

/**
 * A name no two saves can share: the date and the time to the second, in UTC
 * to match the header. Windows won't take a colon in a filename, so the ISO
 * separators go; saving twice in a minute used to produce "… (1).txt".
 */
export function supportLogFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[T:]/g, '-').replace(/\.\d+Z$/, 'Z');
  return `gp200-studio-log-${stamp}.txt`;
}

/** How many lines are held, for the button's label and its tests. */
export function supportLogSize(): number {
  return lines.length;
}

/** Start again — a fresh log for a problem someone is about to reproduce. */
export function clearSupportLog(): void {
  lines.length = 0;
  dropped = 0;
  startedAt = Date.now();
}
