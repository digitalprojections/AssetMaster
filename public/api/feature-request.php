<?php
declare(strict_types=1);
// Private configuration lives outside the public document root.
function feature_text_length(string $value): int {
    // Match JavaScript/HTML UTF-16 length, including non-ASCII feature requests.
    preg_match_all('/[\s\S]/u', $value, $characters);
    $length = 0;
    foreach ($characters[0] as $character) $length += strlen($character) === 4 ? 2 : 1;
    return $length;
}
function validate_feature_request(array $data): bool {
    foreach (['title', 'description', 'replyTo', 'website'] as $field) {
        if (!isset($data[$field]) || !is_string($data[$field])) return false;
    }
    return feature_text_length(trim($data['title'])) >= 3 && feature_text_length($data['title']) <= 120
        && feature_text_length(trim($data['description'])) >= 10 && feature_text_length($data['description']) <= 5000
        && strlen($data['replyTo']) <= 254
        && ($data['replyTo'] === '' || filter_var($data['replyTo'], FILTER_VALIDATE_EMAIL) !== false);
}
function feature_mail_configuration_valid(array $config): bool {
    foreach (['smtpHost', 'smtpUsername', 'smtpPassword', 'rateLimitSecret', 'sender', 'recipient'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key]) || trim($config[$key]) === '') return false;
    }
    return preg_match('/^[a-zA-Z0-9.-]+$/D', $config['smtpHost']) === 1
        && filter_var($config['sender'], FILTER_VALIDATE_EMAIL) !== false
        && filter_var($config['recipient'], FILTER_VALIDATE_EMAIL) !== false;
}
function build_feature_request_email(array $payload, string $messageId): string {
    $subject = str_replace(["\r", "\n"], ' ', $payload['subject']);
    $headers = [
        'Date: ' . gmdate('D, d M Y H:i:s +0000'),
        'From: AssetMaster <' . $payload['from'] . '>',
        'To: ' . implode(', ', $payload['to']),
        'Subject: ' . mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n", 9),
        'Message-ID: <' . $messageId . '@created.link>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
    ];
    if (isset($payload['reply_to'])) $headers[] = 'Reply-To: ' . $payload['reply_to'];
    return implode("\r\n", $headers) . "\r\n\r\n" . quoted_printable_encode(preg_replace('/\r\n|\r|\n/', "\r\n", $payload['text'])) . "\r\n";
}
function deliver_feature_request(array $payload, array $config, string $key, array $data): bool {
    $message = build_feature_request_email($payload, hash_hmac('sha256', $key . json_encode($data), $config['rateLimitSecret']));
    $offset = 0;
    $curl = curl_init('smtp://' . $config['smtpHost'] . ':587');
    curl_setopt_array($curl, [
        CURLOPT_USE_SSL => CURLUSESSL_ALL,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_SSLVERSION => CURL_SSLVERSION_TLSv1_2,
        CURLOPT_USERNAME => $config['smtpUsername'],
        CURLOPT_PASSWORD => $config['smtpPassword'],
        CURLOPT_MAIL_FROM => $config['sender'],
        CURLOPT_MAIL_RCPT => $payload['to'],
        CURLOPT_UPLOAD => true,
        CURLOPT_INFILESIZE => strlen($message),
        CURLOPT_READFUNCTION => static function ($handle, $stream, int $length) use ($message, &$offset): string {
            $chunk = substr($message, $offset, $length); $offset += strlen($chunk); return $chunk;
        },
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); curl_close($curl);
    return $response !== false && $status === 250;
}
function feature_request_main(?string $rawInput = null, ?array $configOverride = null, ?callable $deliver = null): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $origins = ['https://created.link', 'https://localhost', 'capacitor://localhost', 'http://localhost:3001'];
    if ($origin !== '' && !in_array($origin, $origins, true)) { http_response_code(403); echo '{"ok":false}'; return; }
    if ($origin !== '') { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        header('Access-Control-Allow-Methods: POST, OPTIONS'); header('Access-Control-Allow-Headers: Content-Type'); http_response_code(204); return;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST, OPTIONS'); http_response_code(405); echo '{"ok":false}'; return; }
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) { http_response_code(415); echo '{"ok":false}'; return; }
    $raw = $rawInput ?? file_get_contents('php://input', false, null, 0, 24001);
    $data = json_decode($raw ?: '', true);
    if (strlen($raw ?: '') > 24000 || !is_array($data) || !validate_feature_request($data) || $data['website'] !== '') { http_response_code(400); echo '{"ok":false}'; return; }
    $configPath = getenv('ASSETMASTER_FEEDBACK_CONFIG') ?: dirname($_SERVER['DOCUMENT_ROOT']) . '/assetmaster-private/assetmaster-feedback.json';
    $config = $configOverride ?? (is_readable($configPath) ? json_decode(file_get_contents($configPath), true) : null);
    if (!is_array($config) || !feature_mail_configuration_valid($config) || ($deliver === null && (!function_exists('curl_init') || !function_exists('mb_encode_mimeheader')))) { http_response_code(503); echo '{"ok":false}'; return; }
    // Short-lived IP hashes prevent repeated sends. No request text is stored here.
    $directory = dirname($configPath) . '/assetmaster-feedback-rate';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) { http_response_code(503); echo '{"ok":false}'; return; }
    foreach (glob($directory . '/*.json') ?: [] as $old) { if (filemtime($old) < time() - 3600) @unlink($old); }
    $key = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $config['rateLimitSecret']);
    $file = fopen($directory . '/' . $key . '.json', 'c+');
    if (!$file || !flock($file, LOCK_EX)) { http_response_code(503); echo '{"ok":false}'; return; }
    $record = json_decode(stream_get_contents($file), true) ?: [];
    $last = (int)($record['attemptedAt'] ?? 0);
    $digest = hash_hmac('sha256', json_encode($data), $config['rateLimitSecret']);
    if (($record['deliveredHash'] ?? '') === $digest) { flock($file, LOCK_UN); fclose($file); echo '{"ok":true}'; return; }
    if (time() - $last < 120) { flock($file, LOCK_UN); fclose($file); http_response_code(429); echo '{"ok":false}'; return; }
    $record['attemptedAt'] = time();
    ftruncate($file, 0); rewind($file); fwrite($file, json_encode($record)); fflush($file);
    $payload = ['from' => $config['sender'], 'to' => [$config['recipient']], 'subject' => 'AssetMaster feature request: ' . str_replace(["\r", "\n"], ' ', $data['title']), 'text' => $data['description'] . "\n\nReply email: " . ($data['replyTo'] ?: 'Not provided')];
    if ($data['replyTo'] !== '') $payload['reply_to'] = $data['replyTo'];
    $send = $deliver ?? 'deliver_feature_request';
    $accepted = $send($payload, $config, $key, $data);
    if ($accepted) {
        $record['deliveredHash'] = $digest;
        ftruncate($file, 0); rewind($file); fwrite($file, json_encode($record));
    }
    flock($file, LOCK_UN); fclose($file);
    if (!$accepted) { http_response_code(502); echo '{"ok":false}'; return; }
    echo '{"ok":true}';
}
if (!defined('ASSETMASTER_FEEDBACK_TEST')) feature_request_main();
