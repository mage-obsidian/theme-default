<?php
declare(strict_types=1);

use Magento\Framework\App\Bootstrap;
use Magento\Framework\App\State;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order\Email\Sender\CreditmemoSender;
use Magento\Sales\Model\Order\Email\Sender\InvoiceSender;
use Magento\Sales\Model\Order\Email\Sender\OrderSender;
use Magento\Sales\Model\Order\Email\Sender\ShipmentSender;

$root = getenv('MAGENTO_ROOT') ?: '/var/www/html';
require $root . '/app/bootstrap.php';

$fixturePath = dirname(__DIR__, 2) . '/.artifacts/fixture.json';
if (!is_file($fixturePath)) {
    fwrite(STDERR, "no fixture: run the seed first\n");
    exit(2);
}
$fixture = json_decode((string)file_get_contents($fixturePath), true);

$bootstrap = Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(State::class)->setAreaCode('frontend');

$order = $om->get(OrderRepositoryInterface::class)->get((int)$fixture['documentedOrderId']);

$sent = [];
$failed = [];

$attempt = static function (string $label, callable $send) use (&$sent, &$failed): void {
    try {
        $send();
        $sent[] = $label;
        printf("%-28s sent\n", $label);
    } catch (Throwable $e) {
        $failed[] = $label;
        printf("%-28s FAILED %s: %s\n", $label, get_class($e), substr($e->getMessage(), 0, 140));
    }
};

$attempt('order', static function () use ($om, $order): void {
    $order->setEmailSent(null);
    $om->get(OrderSender::class)->send($order, true);
});

foreach ($order->getInvoiceCollection() as $invoice) {
    $attempt('invoice', static function () use ($om, $invoice): void {
        $invoice->setEmailSent(null);
        $om->get(InvoiceSender::class)->send($invoice, true);
    });
    break;
}

foreach ($order->getShipmentsCollection() as $shipment) {
    $attempt('shipment', static function () use ($om, $shipment): void {
        $shipment->setEmailSent(null);
        $om->get(ShipmentSender::class)->send($shipment, true);
    });
    break;
}

foreach ($order->getCreditmemosCollection() as $creditmemo) {
    $attempt('creditmemo', static function () use ($om, $creditmemo): void {
        $creditmemo->setEmailSent(null);
        $om->get(CreditmemoSender::class)->send($creditmemo, true);
    });
    break;
}

printf("\norder %s: %d sent, %d failed\n", $order->getIncrementId(), count($sent), count($failed));
file_put_contents(dirname(__DIR__, 2) . '/.artifacts/emails-sent.json', json_encode([
    'incrementId' => $order->getIncrementId(),
    'sent' => $sent,
    'failed' => $failed,
], JSON_PRETTY_PRINT) . "\n");

exit($failed === [] ? 0 : 1);
