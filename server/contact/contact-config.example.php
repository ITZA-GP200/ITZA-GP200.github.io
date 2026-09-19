<?php
/**
 * Copy this file to contact-config.php (same folder) on the server and fill it
 * in. contact-config.php is git-ignored, so the address stays off GitHub.
 */
return [
    // Where messages go. Never shown to the person sending.
    'to' => 'you@example.com',
    // The sender: an address on this host's own domain (hosts reject others).
    'from' => 'GP200 Studio <noreply@example.com>',
    // The site(s) the editor runs on, allowed to post to this script.
    'allowed_origins' => ['https://example.com'],
];
