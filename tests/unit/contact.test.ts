import { describe, expect, it, vi } from 'vitest';
import { contactProblem, sendContactMessage } from '@/core/contact';

const good = { name: 'Kim', email: 'kim@example.com', message: 'Please add INSERT back' };

describe('contactProblem', () => {
  it('accepts a complete message', () => {
    expect(contactProblem(good)).toBeNull();
  });
  it('asks for each missing or bad field', () => {
    expect(contactProblem({ ...good, name: ' ' })).toBe('Please enter your name');
    expect(contactProblem({ ...good, email: 'not-an-email' })).toBe('Please enter a valid email address');
    expect(contactProblem({ ...good, message: '' })).toBe('Please write a message');
    expect(contactProblem({ ...good, message: 'x'.repeat(5001) })).toContain('under 5,000');
  });
});

describe('sendContactMessage', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('posts the fields (and the empty honeypot) and resolves on ok', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(200, { ok: true }));
    await sendContactMessage(good, '/contact.php', fetcher);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/contact.php');
    const body = init.body as FormData;
    expect([body.get('name'), body.get('email'), body.get('message'), body.get('website')])
      .toEqual(['Kim', 'kim@example.com', 'Please add INSERT back', '']);
  });

  it('passes on the server’s own error message', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(429, { ok: false, error: 'Too many messages' }));
    await expect(sendContactMessage(good, '/c', fetcher)).rejects.toThrow('Too many messages');
  });

  it('says so when no contact service answers (a dev server replies with a page)', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<!doctype html><html></html>', { status: 200 }));
    await expect(sendContactMessage(good, '/c', fetcher)).rejects.toThrow('isn’t available on this site');
  });

  it('never posts an incomplete message', async () => {
    const fetcher = vi.fn();
    await expect(sendContactMessage({ ...good, email: 'x' }, '/c', fetcher)).rejects.toThrow('valid email');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
