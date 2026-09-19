/**
 * The editor's contact form: checks the fields and posts them to the server's
 * contact.php (server/contact/), which mails them on. The destination address
 * lives only in that server's config, never in the app.
 */

export interface ContactFields {
  name: string;
  email: string;
  message: string;
  /** Honeypot: hidden from people, filled by bots. */
  website?: string;
}

/** Where the form posts: VITE_CONTACT_ENDPOINT, else /contact.php here. */
export const CONTACT_ENDPOINT: string = import.meta.env.VITE_CONTACT_ENDPOINT ?? '/contact.php';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What's wrong with the fields, or null when they can be sent. */
export function contactProblem(fields: ContactFields): string | null {
  if (!fields.name.trim()) return 'Please enter your name';
  if (!EMAIL.test(fields.email.trim())) return 'Please enter a valid email address';
  if (!fields.message.trim()) return 'Please write a message';
  if (fields.name.length > 100) return 'That name is too long';
  if (fields.message.length > 5000) return 'Please keep the message under 5,000 characters';
  return null;
}

/**
 * Send the message. Resolves when the server confirms it; throws a plain
 * message otherwise, including when no contact service answers here (a dev
 * server replies with the app's own page, not the script's JSON).
 */
export async function sendContactMessage(
  fields: ContactFields,
  endpoint = CONTACT_ENDPOINT,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const problem = contactProblem(fields);
  if (problem) throw new Error(problem);
  const body = new FormData();
  body.set('name', fields.name.trim());
  body.set('email', fields.email.trim());
  body.set('message', fields.message.trim());
  body.set('website', fields.website ?? '');
  let response: Response;
  try {
    response = await fetcher(endpoint, { method: 'POST', body });
  } catch {
    throw new Error('Couldn’t reach the contact service; check your connection and try again');
  }
  let reply: { ok?: boolean; error?: string } | null = null;
  try {
    reply = (await response.json()) as { ok?: boolean; error?: string };
  } catch {
    reply = null;
  }
  if (!reply) throw new Error('The contact service isn’t available on this site');
  if (!response.ok || reply.ok !== true) throw new Error(reply.error ?? 'The message couldn’t be sent');
}
