<?php
/**
 * GP200 Studio (fork) contact form endpoint.
 *
 * Receives name / email / message from the editor's contact form and mails
 * them to the address in contact-config.php. That file lives only on the
 * server (it's git-ignored), so the address never appears in the app or the
 * repository. Upload this file and contact-config.php together to a PHP host;
 * see README.md in this folder.
 *
 * Replies are JSON: {"ok": true} or {"ok": false, "error": "..."}.
 */

header('Content-Type: application/json; charset=utf-8');

function reply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

$configFile = __DIR__ . '/contact-config.php';
if (!is_file($configFile)) {
    reply(500, ['ok' => false, 'error' => 'The contact form isn’t set up on this server yet.']);
}
$config = require $configFile;

// Let the editor call this from its own site (CORS), and only from there.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $config['allowed_origins'] ?? [], true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'Send the form with POST.']);
}

$name = trim((string) ($_POST['name'] ?? ''));
$email = trim((string) ($_POST['email'] ?? ''));
$message = trim((string) ($_POST['message'] ?? ''));

// Honeypot: a hidden field people never see or fill. Bots do; pretend success.
if ((string) ($_POST['website'] ?? '') !== '') {
    reply(200, ['ok' => true]);
}

if ($name === '' || $message === '') {
    reply(400, ['ok' => false, 'error' => 'Please fill in your name and a message.']);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    reply(400, ['ok' => false, 'error' => 'Please enter a valid email address.']);
}
if (mb_strlen($name) > 100 || mb_strlen($email) > 200 || mb_strlen($message) > 5000) {
    reply(400, ['ok' => false, 'error' => 'That’s too long (message up to 5,000 characters).']);
}

// No header injection: names and addresses never carry line breaks.
$name = preg_replace('/[\r\n]+/', ' ', $name);
$email = preg_replace('/[\r\n]+/', '', $email);

// Simple rate limit: at most 5 messages per hour from one address.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$stampFile = sys_get_temp_dir() . '/gp200-contact-' . md5($ip);
$recent = [];
if (is_file($stampFile)) {
    $recent = array_filter(
        array_map('intval', explode(',', (string) file_get_contents($stampFile))),
        fn (int $t) => $t > time() - 3600
    );
}
if (count($recent) >= 5) {
    reply(429, ['ok' => false, 'error' => 'Too many messages from here; please try again in an hour.']);
}
$recent[] = time();
file_put_contents($stampFile, implode(',', $recent));

$subject = 'GP200 Studio contact: ' . mb_substr($name, 0, 60);
$body = "From: {$name} <{$email}>\n\n{$message}\n";
$headers = [
    // Must be an address on this host's domain, or many servers refuse it.
    'From' => $config['from'],
    'Reply-To' => $email,
    'Content-Type' => 'text/plain; charset=UTF-8',
];
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

if (!mail($config['to'], $encodedSubject, $body, $headers)) {
    reply(500, ['ok' => false, 'error' => 'The server couldn’t send the message; please try again later.']);
}
reply(200, ['ok' => true]);
