<?php
/**
 * 問卷寄信設定範本
 *
 * 使用方式：複製本檔為 api/config.php，再填入實際值。
 * api/config.php 已列在 .gitignore，不會進版本控制；也不要把金鑰寫進前端或其他檔案。
 */
return [
    // 收件信箱（可用逗號分隔多個）
    'mail_to' => '【收件 Email】',

    // 寄件信箱：請用網站網域的信箱（例如 noreply@你的網域），並在 cPanel 建立，避免被當成垃圾信
    'mail_from' => 'noreply@【網站網域】',
    'mail_from_name' => 'FEELWONDER 網站',

    // 信件主旨前綴
    'subject_prefix' => '[企業 AI 需求評估]',

    // Cloudflare Turnstile secret key；留空時略過驗證（site key 設在 js/assessment.js）
    'turnstile_secret' => '',
];
