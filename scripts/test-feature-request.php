<?php
define('ASSETMASTER_FEEDBACK_TEST', true);
require __DIR__ . '/../public/api/feature-request.php';
function check(bool $condition): void { if (!$condition) throw new RuntimeException('Feature request validation failed'); }
$valid = ['title'=>'Timeline markers', 'description'=>'Add named markers for animation.', 'replyTo'=>'', 'website'=>''];
check(validate_feature_request($valid));
check(feature_text_length('改善案') === 3);
check(feature_text_length('😀') === 2);
check(validate_feature_request(array_replace($valid, ['title'=>str_repeat('案',120)])));
check(!validate_feature_request(array_replace($valid, ['title'=>str_repeat('案',121)])));
foreach ([['title'=>''], ['description'=>'short'], ['replyTo'=>"x@example.com\r\nBcc: x@example.com"], ['title'=>str_repeat('x',121)], ['description'=>str_repeat('x',5001)], ['website'=>[]]] as $change) check(!validate_feature_request(array_replace($valid,$change)));
check(validate_feature_request(array_replace($valid,['replyTo'=>'user@example.com'])));
$smtp = ['smtpHost'=>'email-smtp.us-east-1.amazonaws.com', 'smtpUsername'=>'test-user', 'smtpPassword'=>'test-password', 'rateLimitSecret'=>'test-rate-secret', 'sender'=>'test@example.com', 'recipient'=>'destination@example.com'];
check(feature_mail_configuration_valid($smtp));
check(!feature_mail_configuration_valid(array_replace($smtp, ['smtpHost'=>'smtp://invalid/path'])));
check(!feature_mail_configuration_valid(array_replace($smtp, ['smtpPassword'=>''])));
$mime = build_feature_request_email(['from'=>'test@example.com', 'to'=>['destination@example.com'], 'subject'=>"AssetMaster: Idea\r\nBcc: attacker@example.com", 'text'=>'Private idea', 'reply_to'=>'user@example.com'], 'test-message');
check(strpos($mime, "\r\nBcc:") === false);
check(strpos($mime, 'Reply-To: user@example.com') !== false);
check(strpos($mime, 'Content-Transfer-Encoding: quoted-printable') !== false);
$lines = build_feature_request_email(['from'=>'test@example.com', 'to'=>['destination@example.com'], 'subject'=>'Test', 'text'=>"First\r\nSecond\nThird"], 'test-lines');
check(strpos($lines, "First\r\nSecond\r\nThird") !== false);
check(strpos($lines, "\r\r\n") === false);
// Exercise HTTP status handling and delivery acknowledgements without sending email.
$temp = sys_get_temp_dir() . '/assetmaster-feedback-test-' . bin2hex(random_bytes(8));
mkdir($temp, 0700);
putenv('ASSETMASTER_FEEDBACK_CONFIG=' . $temp . '/config.json');
$_SERVER['HTTP_ORIGIN'] = 'https://created.link';
$_SERVER['CONTENT_TYPE'] = 'application/json';
$_SERVER['REQUEST_METHOD'] = 'POST';
$config = $smtp;
function request_status(string $body, array $config, callable $send): array {
    http_response_code(200); ob_start(); feature_request_main($body, $config, $send);
    return [http_response_code(), json_decode(ob_get_clean(), true)];
}
try {
    check(request_status('invalid JSON', $config, fn()=>true)[0] === 400);
    check(request_status(json_encode($valid), [], fn()=>true)[0] === 503);
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
    check(request_status(json_encode($valid), $config, function($payload) { check($payload['to'] === ['destination@example.com']); check(!isset($payload['reply_to'])); return true; }) === [200, ['ok'=>true]]);
    check(request_status(json_encode($valid), $config, function() { throw new RuntimeException('Duplicate sent twice'); })[0] === 200);
    check(request_status(json_encode(array_replace($valid, ['title'=>'Another feature'])), $config, fn()=>true)[0] === 429);
    $_SERVER['REMOTE_ADDR'] = '127.0.0.2';
    check(request_status(json_encode($valid), $config, fn()=>false) === [502, ['ok'=>false]]);
    $_SERVER['REMOTE_ADDR'] = '127.0.0.3';
    $reply = array_replace($valid, ['replyTo'=>'user@example.com']);
    check(request_status(json_encode($reply), $config, function($payload) { check($payload['reply_to'] === 'user@example.com'); return true; })[0] === 200);
    check(request_status(json_encode(array_replace($valid,['website'=>'spam'])), $config, fn()=>true)[0] === 400);
    $_SERVER['HTTP_ORIGIN'] = 'https://untrusted.example';
    check(request_status(json_encode($valid), $config, fn()=>true)[0] === 403);
    $_SERVER['HTTP_ORIGIN'] = 'https://created.link'; $_SERVER['REQUEST_METHOD'] = 'GET';
    check(request_status('', $config, fn()=>true)[0] === 405);
    $_SERVER['REQUEST_METHOD'] = 'OPTIONS';
    check(request_status('', $config, fn()=>true)[0] === 204);
} finally {
    foreach (glob($temp . '/assetmaster-feedback-rate/*.json') ?: [] as $file) unlink($file);
    if (is_dir($temp . '/assetmaster-feedback-rate')) rmdir($temp . '/assetmaster-feedback-rate');
    rmdir($temp);
}
echo "Feature request PHP validation, status, rate-limit and delivery tests passed\n";
