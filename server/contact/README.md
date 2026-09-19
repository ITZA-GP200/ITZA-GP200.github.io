# Contact form endpoint

The editor's ✉ button opens a form (name, email, message) that posts to
`contact.php`, which mails it to the address in `contact-config.php`.

These files are **not** part of the app build: `public/` would copy them to a
static host as plain text, which would expose the config. Upload them
yourself to a host that runs PHP.

## Set up

1. Copy `contact-config.example.php` to `contact-config.php` and fill in:
   - `to`: where messages go (stays on the server);
   - `from`: an address on the PHP host's own domain;
   - `allowed_origins`: the site(s) the editor runs on.
2. Upload `contact.php` and `contact-config.php` to the PHP host, for example
   `https://yourdomain.com/contact/contact.php`.
3. Build the editor with that URL:
   `VITE_CONTACT_ENDPOINT=https://yourdomain.com/contact/contact.php npm run build`
   (default when unset: `/contact.php` on the editor's own site).

`contact-config.php` is git-ignored. The script has a honeypot field, limits
lengths, strips line breaks from header fields and allows 5 messages per hour
per visitor.
