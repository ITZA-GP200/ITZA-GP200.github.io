import { useState, type CSSProperties } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { contactProblem, sendContactMessage, type ContactFields } from '@/core/contact';

interface ContactDialogProps {
  open: boolean;
  onClose: () => void;
  /** Injected in tests; defaults to posting to the server's contact.php. */
  send?: (fields: ContactFields) => Promise<void>;
}

const EMPTY: ContactFields = { name: '', email: '', message: '', website: '' };

const fieldStyle: CSSProperties = {
  background: 'var(--bg-deep)',
  border: '1px solid var(--border-active)',
  color: 'var(--text-primary)',
};

/**
 * Feature requests and bug reports: name, email and message, sent through the
 * server's contact script so the destination address never reaches the page.
 */
export function ContactDialog({ open, onClose, send = sendContactMessage }: ContactDialogProps) {
  const [fields, setFields] = useState<ContactFields>(EMPTY);
  const [state, setState] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [error, setError] = useState<string | null>(null);

  function close() {
    onClose();
    // Start fresh next time, unless a message is half-written.
    if (state === 'sent') {
      setFields(EMPTY);
      setState('editing');
    }
    setError(null);
  }

  async function submit() {
    const problem = contactProblem(fields);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setState('sending');
    try {
      await send(fields);
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('editing');
    }
  }

  const set = (key: keyof ContactFields) => (event: { target: { value: string } }) =>
    setFields((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <Dialog open={open} onClose={close} title="Contact" closeOnOverlayClick={state !== 'sending'}>
      {state === 'sent' ? (
        <div className="space-y-4 font-mono-display text-sm">
          <p style={{ color: 'var(--text-primary)' }}>Thanks, your message is on its way.</p>
          <div className="flex justify-end">
            <Button size="sm" autoFocus onClick={close}>CLOSE</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-3 font-mono-display text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="text-caption" style={{ color: 'var(--text-muted)' }}>
            Feature requests and bug reports are welcome. I can’t actively support this fork, but I’ll address
            anything I can reproduce as quickly as I can.
          </p>
          <label className="block space-y-1">
            <span className="text-caption" style={{ color: 'var(--text-muted)' }}>NAME</span>
            <input className="w-full rounded px-2 py-1.5" style={fieldStyle} value={fields.name}
              onChange={set('name')} maxLength={100} autoComplete="name" />
          </label>
          <label className="block space-y-1">
            <span className="text-caption" style={{ color: 'var(--text-muted)' }}>EMAIL</span>
            <input className="w-full rounded px-2 py-1.5" style={fieldStyle} type="email" value={fields.email}
              onChange={set('email')} maxLength={200} autoComplete="email" />
          </label>
          <label className="block space-y-1">
            <span className="text-caption" style={{ color: 'var(--text-muted)' }}>MESSAGE</span>
            <textarea className="w-full rounded px-2 py-1.5" style={{ ...fieldStyle, minHeight: 140 }}
              value={fields.message} onChange={set('message')} maxLength={5000} />
          </label>
          {/* Honeypot: off-screen and skipped by keyboard and screen readers. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={fields.website}
            onChange={set('website')}
            style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }}
          />
          {error && (
            <p role="alert" className="text-caption" style={{ color: 'var(--accent-red)' }}>{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" onClick={close} disabled={state === 'sending'}>
              CANCEL
            </Button>
            <Button type="submit" size="sm" disabled={state === 'sending'}>
              {state === 'sending' ? 'SENDING…' : 'SEND'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
