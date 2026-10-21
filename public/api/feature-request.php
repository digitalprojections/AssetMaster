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
function deliver_feature_request(array $payload, array $config, string $key, array $data): bool {
    $curl = curl_init('https://api.resend.com/emails');
    curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $config['apiKey'], 'Content-Type: application/json', 'Idempotency-Key: assetmaster-' . hash_hmac('sha256', $key . json_encode($data), $config['apiKey'])], CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15]);
    $response = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
    $result = json_decode(is_string($response) ? $response : '', true);
    return $status >= 200 && $status < 300 && !empty($result['id']);
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
    $configPath = getenv('ASSETMASTER_FEEDBACK_CONFIG') ?: dirname($_SERVER['DOCUMENT_ROOT']) . '/private/assetmaster-feedback.json';
    $config = $configOverride ?? (is_readable($configPath) ? json_decode(file_get_contents($configPath), true) : null);
    if (!is_array($config) || empty($config['apiKey']) || empty($config['recipient']) || empty($config['sender']) || ($deliver === null && !function_exists('curl_init'))) { http_response_code(503); echo '{"ok":false}'; return; }
    // Short-lived IP hashes prevent repeated sends. No request text is stored here.
    $directory = dirname($configPath) . '/assetmaster-feedback-rate';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) { http_response_code(503); echo '{"ok":false}'; return; }
    foreach (glob($directory . '/*.json') ?: [] as $old) { if (filemtime($old) < time() - 3600) @unlink($old); }
    $key = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $config['apiKey']);
    $file = fopen($directory . '/' . $key . '.json', 'c+');
    if (!$file || !flock($file, LOCK_EX)) { http_response_code(503); echo '{"ok":false}'; return; }
    $last = (int)stream_get_contents($file);
    if (time() - $last < 120) { flock($file, LOCK_UN); fclose($file); http_response_code(429); echo '{"ok":false}'; return; }
    ftruncate($file, 0); rewind($file); fwrite($file, (string)time()); flock($file, LOCK_UN); fclose($file);
    $payload = ['from' => $config['sender'], 'to' => [$config['recipient']], 'subject' => 'AssetMaster feature request: ' . str_replace(["\r", "\n"], ' ', $data['title']), 'text' => $data['description'] . "\n\nReply email: " . ($data['replyTo'] ?: 'Not provided')];
    if ($data['replyTo'] !== '') $payload['reply_to'] = $data['replyTo'];
    $send = $deliver ?? 'deliver_feature_request';
    if (!$send($payload, $config, $key, $data)) { http_response_code(502); echo '{"ok":false}'; return; }
    echo '{"ok":true}';
}
if (!defined('ASSETMASTER_FEEDBACK_TEST')) feature_request_main();
