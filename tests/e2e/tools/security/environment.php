<?php
declare(strict_types=1);

use Magento\Framework\App\Bootstrap;
use Magento\Framework\App\State;
use Magento\Framework\App\DeploymentConfig;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;

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

$store = $objectManager->get(StoreManagerInterface::class)->getStore();
$scopeConfig = $objectManager->get(\Magento\Framework\App\Config\ScopeConfigInterface::class);
$moduleList = $objectManager->get(ModuleListInterface::class);
$deployment = $objectManager->get(DeploymentConfig::class);

$relaxed = [];

$bypassModules = array_values(array_filter(
    $moduleList->getNames(),
    static fn (string $name): bool => str_contains($name, 'CustomerBypass')
));
foreach ($bypassModules as $module) {
    $relaxed[] = [
        'control' => 'password verification',
        'named' => $module,
        'reason' => 'the module is enabled and lets a sign-in through without the real password, so any check that rests on a wrong password being refused proves nothing here',
        'affects' => ['auth-rejection'],
    ];
}

$loginAsEnabled = (string)$scopeConfig->getValue('login_as_customer/general/enabled', ScopeInterface::SCOPE_STORE, $store->getCode());
if ($loginAsEnabled === '1' && $moduleList->has('Magento_LoginAsCustomer')) {
    $relaxed[] = [
        'control' => 'session ownership',
        'named' => 'login_as_customer/general/enabled',
        'reason' => 'an authenticated administrator can assume a customer session without that customer\'s password, so a session in this environment is not proof that the customer authenticated',
        'affects' => ['island-authorization'],
    ];
}

$captchaFrontend = (string)$scopeConfig->getValue('customer/captcha/enable', ScopeInterface::SCOPE_STORE, $store->getCode());
if ($captchaFrontend !== '1') {
    $relaxed[] = [
        'control' => 'human verification challenge',
        'named' => 'customer/captcha/enable',
        'reason' => 'the storefront challenge is switched off in this environment, so nothing can observe how the login page renders one',
        'affects' => ['captcha'],
    ];
}

$mode = (string)$deployment->get('MAGE_MODE');
if ($mode !== 'production') {
    $relaxed[] = [
        'control' => 'application mode',
        'named' => 'MAGE_MODE=' . $mode,
        'reason' => 'developer mode changes error output, static content resolution and template hints, so a security observation made here does not carry to production',
        'affects' => ['console-clean', 'csp', 'unescaped-output'],
    ];
}

$cspMode = (string)$scopeConfig->getValue('csp/mode/storefront/report_only', ScopeInterface::SCOPE_STORE, $store->getCode());
if ($cspMode !== '0') {
    $relaxed[] = [
        'control' => 'content security policy',
        'named' => 'csp/mode/storefront/report_only',
        'reason' => 'the platform policy is in report-only mode, so the suite applies its own enforcing policy in the browser rather than observing the deployment\'s',
        'affects' => ['csp'],
    ];
}

echo json_encode([
    'mode' => $mode,
    'store' => $store->getCode(),
    'checkedAt' => date('Y-m-d'),
    'relaxed' => $relaxed,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
