/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GA4 measurement ID (`G-XXXXXXXXXX`). Absent or malformed disables analytics. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** Where the contact form posts (server/contact/contact.php on a PHP host). */
  readonly VITE_CONTACT_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Release tag + commits since it, from `git describe` at build time (see
 *  vite.config.ts). Null when no release tag was reachable. */
declare const __APP_VERSION__: import('@/core/appVersion').AppVersion | null;
