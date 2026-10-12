<?php
/**
 * 企業 AI 需求評估：表單送出 → 驗證 → 以 PHP mail() 寄到業務信箱
 *
 * 前端：js/assessment.js（fetch POST JSON）
 * 設定：api/config.php（由 api/config.sample.php 複製後填寫，不進版本控制）
 * 相容：PHP 7.4 以上
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const ANSWER_KEYS = ['industry', 'pain', 'aiuse', 'size', 'data', 'budget', 'timing', 'role'];
const REQUIRED_KEYS = ['industry', 'aiuse', 'size', 'data', 'budget', 'timing', 'role']; // 單選題
const RESULTS = ['qualified' => '符合訪談條件', 'nurture' => '培養名單'];

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

/** 移除控制字元、去頭尾空白並限制長度（不依賴 mbstring） */
function clean_text($value, int $max): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value);
    if ($value === null) {
        return ''; // 非合法 UTF-8
    }
    $value = trim($value);
    if (preg_match_all('/./us', $value) > $max) {
        preg_match('/^.{0,' . $max . '}/us', $value, $m);
        $value = $m[0];
    }
    return $value;
}

/** 單行文字：用於信件標頭 */
function one_line(string $value): string
{
    return trim((string) preg_replace('/[\r\n\t]+/', ' ', $value));
}

function encode_header(string $value): string
{
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function verify_turnstile(string $secret, string $token, string $ip): bool
{
    $fields = http_build_query(['secret' => $secret, 'response' => $token, 'remoteip' => $ip]);
    $url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    $response = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $fields,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);
    } else {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $fields,
            'timeout' => 8,
        ]]);
        $response = @file_get_contents($url, false, $context);
    }
    if (!is_string($response)) {
        return false;
    }
    $json = json_decode($response, true);
    return is_array($json) && !empty($json['success']);
}

// ---------- 請求檢查 ----------
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

// 只接受同網域送出的表單
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) {
    respond(403, ['ok' => false, 'error' => 'forbidden_origin']);
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    respond(500, ['ok' => false, 'error' => 'not_configured']);
}
$config = require $configFile;
if (!is_array($config)) {
    respond(500, ['ok' => false, 'error' => 'not_configured']);
}

$raw = file_get_contents('php://input', false, null, 0, 32768);
$data = json_decode(is_string($raw) ? $raw : '', true);
if (!is_array($data)) {
    respond(400, ['ok' => false, 'error' => 'invalid_json']);
}

// 防機器人：honeypot 欄位有值就假裝成功、不寄信
if (clean_text($data['website'] ?? '', 200) !== '') {
    respond(200, ['ok' => true]);
}

// Cloudflare Turnstile（secret 留空時略過）
$turnstileSecret = trim((string) ($config['turnstile_secret'] ?? ''));
if ($turnstileSecret !== '') {
    $token = clean_text($data['turnstileToken'] ?? '', 2048);
    if ($token === '' || !verify_turnstile($turnstileSecret, $token, (string) ($_SERVER['REMOTE_ADDR'] ?? ''))) {
        respond(403, ['ok' => false, 'error' => 'turnstile_failed']);
    }
}

// ---------- 欄位驗證 ----------
$errors = [];

$answers = [];
if (!is_array($data['answers'] ?? null) || count($data['answers']) > 20) {
    $errors[] = 'answers';
} else {
    foreach ($data['answers'] as $item) {
        if (!is_array($item)) {
            continue;
        }
        $key = clean_text($item['key'] ?? '', 20);
        if (!in_array($key, ANSWER_KEYS, true)) {
            continue;
        }
        $answers[$key] = [
            'question' => one_line(clean_text($item['question'] ?? '', 100)),
            'answer' => one_line(clean_text($item['answer'] ?? '', 300)),
        ];
    }
    foreach (REQUIRED_KEYS as $key) {
        if (!isset($answers[$key]) || $answers[$key]['answer'] === '') {
            $errors[] = 'answer:' . $key;
        }
    }
}

$contactIn = is_array($data['contact'] ?? null) ? $data['contact'] : [];
$contact = [
    'name' => one_line(clean_text($contactIn['name'] ?? '', 100)),
    'company' => one_line(clean_text($contactIn['company'] ?? '', 200)),
    'phone' => one_line(clean_text($contactIn['phone'] ?? '', 40)),
    'email' => one_line(clean_text($contactIn['email'] ?? '', 200)),
];
if ($contact['name'] === '') {
    $errors[] = 'name';
}
if (filter_var($contact['email'], FILTER_VALIDATE_EMAIL) === false) {
    $errors[] = 'email';
}
if ($contact['phone'] !== '' && !preg_match('/^[0-9+\-#()\s.]{6,40}$/', $contact['phone'])) {
    $errors[] = 'phone';
}

$result = clean_text($data['result'] ?? '', 20);
if (!isset(RESULTS[$result])) {
    $errors[] = 'result';
}

if ($errors) {
    respond(422, ['ok' => false, 'error' => 'invalid_fields', 'fields' => $errors]);
}

// ---------- 寄信 ----------
$mailTo = trim((string) ($config['mail_to'] ?? ''));
$mailFrom = trim((string) ($config['mail_from'] ?? ''));
$recipients = array_filter(array_map('trim', explode(',', $mailTo)));
$validRecipients = array_filter($recipients, function ($r) {
    return filter_var($r, FILTER_VALIDATE_EMAIL) !== false;
});
if (!$recipients || count($validRecipients) !== count($recipients)) {
    respond(500, ['ok' => false, 'error' => 'mail_to_not_configured']);
}

date_default_timezone_set('Asia/Taipei');
$page = one_line(clean_text($data['page'] ?? '', 500));
$who = $contact['company'] !== '' ? $contact['company'] : $contact['name'];

$lines = [];
$lines[] = '篩選結果：' . RESULTS[$result];
$lines[] = '送出時間：' . date('Y-m-d H:i') . '（台北時間）';
if ($page !== '') {
    $lines[] = '來源頁面：' . $page;
}
$lines[] = 'IP：' . (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$lines[] = '';
$lines[] = '【聯絡資料】';
$lines[] = '姓名：' . $contact['name'];
$lines[] = '公司名稱：' . ($contact['company'] !== '' ? $contact['company'] : '（未填）');
$lines[] = '手機：' . ($contact['phone'] !== '' ? $contact['phone'] : '（未填）');
$lines[] = 'Email：' . $contact['email'];
$lines[] = '';
$lines[] = '【問卷回答】';
foreach (ANSWER_KEYS as $key) {
    if (!isset($answers[$key])) {
        continue;
    }
    $question = $answers[$key]['question'] !== '' ? $answers[$key]['question'] : $key;
    $answer = $answers[$key]['answer'] !== '' ? $answers[$key]['answer'] : '（未填）';
    $lines[] = $question . '：' . $answer;
}
$body = implode("\r\n", $lines) . "\r\n";

$subject = one_line(((string) ($config['subject_prefix'] ?? '[企業 AI 需求評估]')) . ' ' . RESULTS[$result] . '｜' . $who);

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Reply-To: ' . $contact['email'],
];
$fromIsValid = filter_var($mailFrom, FILTER_VALIDATE_EMAIL) !== false;
if ($fromIsValid) {
    $fromName = one_line((string) ($config['mail_from_name'] ?? ''));
    $headers[] = 'From: ' . ($fromName !== '' ? encode_header($fromName) . ' ' : '') . '<' . $mailFrom . '>';
}

$sent = @mail(
    implode(', ', $recipients),
    encode_header($subject),
    chunk_split(base64_encode($body)),
    implode("\r\n", $headers),
    $fromIsValid ? '-f' . $mailFrom : ''
);

if (!$sent) {
    respond(500, ['ok' => false, 'error' => 'mail_failed']);
}

respond(200, ['ok' => true]);
