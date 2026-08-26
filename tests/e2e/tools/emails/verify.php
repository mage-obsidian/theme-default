<?php
declare(strict_types=1);

$artifacts = dirname(__DIR__, 2) . '/.artifacts';
$sentPath = $artifacts . '/emails-sent.json';
if (!is_file($sentPath)) {
    fwrite(STDERR, "run send.php first\n");
    exit(2);
}
$sent = json_decode((string)file_get_contents($sentPath), true);
$increment = (string)$sent['incrementId'];

$inbox = json_decode((string)file_get_contents('http://mailcatcher:1080/messages'), true) ?: [];
if ($inbox === []) {
    fwrite(STDERR, "mailcatcher holds no messages\n");
    exit(1);
}

$expected = [
    'order' => '/order confirmation/i',
    'invoice' => '/invoice for your/i',
    'shipment' => '/has shipped/i',
    'creditmemo' => '/credit memo for/i',
];

$failures = 0;
foreach ($expected as $label => $subjectPattern) {
    $match = null;
    foreach ($inbox as $message) {
        if (preg_match($subjectPattern, (string)($message['subject'] ?? ''))) {
            $match = $message;
        }
    }

    if ($match === null) {
        printf("%-12s NO EMAIL matching %s\n", $label, $subjectPattern);
        $failures++;
        continue;
    }

    $body = (string)file_get_contents(sprintf('http://mailcatcher:1080/messages/%d.html', $match['id']));
    $problems = [];

    if (!str_contains($body, $increment)) {
        $problems[] = 'does not name the order ' . $increment;
    }
    if (preg_match('/\{\{|Notice:|Warning:|Fatal error/i', $body)) {
        $problems[] = 'carries an unrendered directive or a PHP notice';
    }
    if (strlen(strip_tags($body)) < 120) {
        $problems[] = 'body is suspiciously short';
    }
    if (!preg_match('/\$[\d,.]+/', $body)) {
        $problems[] = 'states no amount';
    }

    printf(
        "%-12s %s (%d bytes)%s\n",
        $label,
        $problems === [] ? 'renders with its order and totals' : 'PROBLEM',
        strlen($body),
        $problems === [] ? '' : ' — ' . implode('; ', $problems)
    );
    $failures += $problems === [] ? 0 : 1;
}

printf("\n%d of %d transactional emails verified\n", count($expected) - $failures, count($expected));
exit($failures === 0 ? 0 : 1);
