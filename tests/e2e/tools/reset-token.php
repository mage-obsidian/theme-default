<?php
/**
 * This file is part of the MageObsidian - Default theme.
 *
 * @license MIT License - See the LICENSE file in the root directory for details.
 * © 2026 Jeanmarcos Juarez
 *
 * Mints a fresh reset-password token for a seeded customer and prints it:
 *
 *     php app/design/frontend/MageObsidian/default/tests/e2e/tools/reset-token.php <customerId>
 *
 * Development environments only.
 */

declare(strict_types=1);

use Magento\Customer\Model\CustomerRegistry;
use Magento\Framework\App\Bootstrap;
use Magento\Framework\App\State;

$customerId = (int)($argv[1] ?? 0);
if ($customerId <= 0) {
    fwrite(STDERR, "usage: reset-token.php <customerId>\n");
    exit(1);
}

$root = getenv('MAGENTO_ROOT') ?: null;

if (!$root) {
    $candidate = __DIR__;
    while ($candidate !== dirname($candidate)) {
        if (is_file($candidate . '/app/bootstrap.php')) {
            $root = $candidate;
            break;
        }
        $candidate = dirname($candidate);
    }
}

if (!$root || !is_file($root . '/app/bootstrap.php')) {
    fwrite(STDERR, "Could not find a Magento root; set MAGENTO_ROOT.\n");
    exit(1);
}

require $root . '/app/bootstrap.php';

$bootstrap = Bootstrap::create($root, $_SERVER);
$objectManager = $bootstrap->getObjectManager();
$objectManager->get(State::class)->setAreaCode('frontend');

$token = bin2hex(random_bytes(16));
$customer = $objectManager->get(CustomerRegistry::class)->retrieve($customerId);
$customer->changeResetPasswordLinkToken($token);
$customer->save();

fwrite(STDOUT, $token . PHP_EOL);
