<?php
/**
 * This file is part of the MageObsidian - Default theme.
 *
 * @license MIT License - See the LICENSE file in the root directory for details.
 * © 2026 Jeanmarcos Juarez
 *
 * Fixture for the end-to-end suite. Run it from a Magento root:
 *
 *     php app/design/frontend/MageObsidian/default/tests/e2e/tools/seed.php
 *
 * It is idempotent: every step tops the account up to the target and leaves it
 * alone once it is there, so re-running between suites costs seconds.
 *
 * Development environments only — it writes customers, orders and reviews, and
 * it clears the CAPTCHA lockout that would otherwise stop the sign-in fixture.
 *
 * The fixture password is never written down here: set E2E_PASSWORD or let this
 * mint one, and either way it reaches the suite through .artifacts/fixture.json,
 * which is ignored by git.
 */

declare(strict_types=1);

use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\Product\Visibility;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory as ProductCollectionFactory;
use Magento\Customer\Api\AccountManagementInterface;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Api\Data\AddressInterfaceFactory;
use Magento\Customer\Api\Data\CustomerInterfaceFactory;
use Magento\Customer\Api\Data\RegionInterfaceFactory;
use Magento\Customer\Model\CustomerRegistry;
use Magento\Framework\Api\SearchCriteriaBuilder;
use Magento\Framework\App\Bootstrap;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\App\State;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\InventoryApi\Api\Data\SourceItemInterface;
use Magento\InventoryApi\Api\Data\SourceItemInterfaceFactory;
use Magento\InventoryApi\Api\GetSourcesAssignedToStockOrderedByPriorityInterface;
use Magento\InventoryApi\Api\SourceItemRepositoryInterface;
use Magento\InventoryApi\Api\SourceItemsSaveInterface;
use Magento\InventorySalesApi\Api\Data\SalesChannelInterface;
use Magento\InventorySalesApi\Api\GetProductSalableQtyInterface;
use Magento\InventorySalesApi\Api\StockResolverInterface;
use Magento\Newsletter\Model\SubscriptionManagerInterface;
use Magento\Quote\Api\CartManagementInterface;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Review\Model\RatingFactory;
use Magento\Review\Model\ReviewFactory;
use Magento\Sales\Api\CreditmemoManagementInterface;
use Magento\Sales\Api\InvoiceOrderInterface;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Api\ShipOrderInterface;
use Magento\Sales\Model\Order\CreditmemoFactory;
use Magento\Sales\Model\ResourceModel\Order\CollectionFactory as OrderCollectionFactory;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Wishlist\Model\WishlistFactory;

const EMAIL = 'e2e@obsidian.test';
const FIRST_NAME = 'Ada';
const LAST_NAME = 'Obsidian';

/** Above the ten-row page size of every account list, so the pager has to appear. */
const TARGET_ORDERS = 13;
const TARGET_WISHLIST = 18;
const TARGET_REVIEWS = 3;

/**
 * Orders whose chip tone the suite asserts, keyed by their offset from the newest.
 * Anything not listed stays as placed (pending → neutral).
 */
const FORCED_STATES = [
    1 => ['state' => 'complete', 'status' => 'complete'],
    2 => ['state' => 'processing', 'status' => 'processing'],
    3 => ['state' => 'holded', 'status' => 'holded'],
];

/** The newest order gets real documents instead, so the four order tabs have content. */
const DOCUMENTED_OFFSET = 0;

/** The product the checkout specs buy — src/checkout.ts reaches it by URL. */
const CHECKOUT_SKU = '24-WB03';

/** Salable floor every candidate is topped up to, well above what one run spends. */
const TARGET_SALABLE = 100.0;

/** How far back the fixture looks for the orders the detail specs need. */
const ORDER_WINDOW = 12;

// The theme is usually a symlink into a package checkout, so walk up looking for
// the bootstrap rather than counting directories.
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

$out = static function (string $line): void {
    fwrite(STDOUT, $line . PHP_EOL);
};

// Rotated on every seed unless the caller pins one, so no password of this
// account ever outlives the environment it was created in.
$password = getenv('E2E_PASSWORD') ?: ('Obs-' . bin2hex(random_bytes(9)));

$storeManager = $objectManager->get(StoreManagerInterface::class);
$store = $storeManager->getStore(1);
$storeManager->setCurrentStore($store);
$websiteId = (int)$store->getWebsiteId();

$customerRepository = $objectManager->get(CustomerRepositoryInterface::class);
$customerRegistry = $objectManager->get(CustomerRegistry::class);
$connection = $objectManager->get(ResourceConnection::class)->getConnection();

$address = [
    'firstname' => FIRST_NAME,
    'lastname' => LAST_NAME,
    'street' => ['144 Obsidian Row'],
    'city' => 'Austin',
    'region_id' => 57,
    'region' => 'Texas',
    'postcode' => '78701',
    'country_id' => 'US',
    'telephone' => '5125550142',
];

// ---------------------------------------------------------------- customer ---

try {
    $customer = $customerRepository->get(EMAIL, $websiteId);
    $customerModel = $customerRegistry->retrieve((int)$customer->getId());
    $customerModel->setPassword($password);
    $customerModel->setConfirmation(null);
    $customerModel->save();
    $out('customer: reused #' . $customer->getId());
} catch (NoSuchEntityException) {
    $newCustomer = $objectManager->get(CustomerInterfaceFactory::class)->create();
    $newCustomer->setWebsiteId($websiteId)
        ->setStoreId((int)$store->getId())
        ->setEmail(EMAIL)
        ->setFirstname(FIRST_NAME)
        ->setLastname(LAST_NAME);

    $customer = $objectManager->get(AccountManagementInterface::class)
        ->createAccount($newCustomer, $password);

    $customerModel = $customerRegistry->retrieve((int)$customer->getId());
    $customerModel->setConfirmation(null)->save();
    $out('customer: created #' . $customer->getId());
}

$customerId = (int)$customer->getId();

// --------------------------------------------------------------- addresses ---

$customer = $customerRepository->getById($customerId);
$existing = $customer->getAddresses() ?? [];

if (count($existing) < 2) {
    $addressFactory = $objectManager->get(AddressInterfaceFactory::class);
    $regionFactory = $objectManager->get(RegionInterfaceFactory::class);
    $entries = [];

    foreach ([['144 Obsidian Row', 'Austin'], ['9 Alabaster Lane', 'Portland']] as $index => [$street, $city]) {
        $region = $regionFactory->create()
            ->setRegionId($address['region_id'])
            ->setRegion($address['region'])
            ->setRegionCode('TX');

        $entry = $addressFactory->create()
            ->setFirstname(FIRST_NAME)
            ->setLastname(LAST_NAME)
            ->setStreet([$street])
            ->setCity($city)
            ->setRegionId($address['region_id'])
            ->setRegion($region)
            ->setPostcode($address['postcode'])
            ->setCountryId($address['country_id'])
            ->setTelephone($address['telephone'])
            ->setIsDefaultBilling($index === 0)
            ->setIsDefaultShipping($index === 0);

        $entries[] = $entry;
    }

    $customer->setAddresses($entries);
    $customerRepository->save($customer);
    $out('addresses: seeded 2');
} else {
    $out('addresses: ' . count($existing) . ' already there');
}

// The address spec creates one and deletes it again; a crashed run leaves it
// behind, and the next run would find two.
$stale = $connection->fetchCol(
    $connection->select()
        ->from($connection->getTableName('customer_address_entity'), 'entity_id')
        ->where('parent_id = ?', $customerId)
        ->where('street LIKE ?', '%Fixture Way%')
);
if ($stale) {
    $connection->delete(
        $connection->getTableName('customer_address_entity'),
        ['entity_id IN (?)' => $stale]
    );
    $out('addresses: swept ' . count($stale) . ' left over from a previous run');
}

// -------------------------------------------------------------- newsletter ---

$objectManager->get(SubscriptionManagerInterface::class)
    ->subscribeCustomer($customerId, (int)$store->getId());
$out('newsletter: subscribed');

// ---------------------------------------------------------------- products ---

$products = $objectManager->get(ProductCollectionFactory::class)->create()
    ->addAttributeToSelect(['name', 'price'])
    ->addAttributeToFilter('type_id', 'simple')
    ->addAttributeToFilter('status', 1)
    ->addAttributeToFilter('visibility', ['in' => [Visibility::VISIBILITY_BOTH, Visibility::VISIBILITY_IN_CATALOG]])
    ->addStoreFilter($store)
    ->setPageSize(max(TARGET_ORDERS, TARGET_WISHLIST) + 5)
    ->load();

if ($products->getSize() === 0) {
    $out('! no saleable simple products — seed the catalog first');
    exit(1);
}

$skus = array_values(array_map(static fn($product) => (string)$product->getSku(), $products->getItems()));
$out('products: ' . count($skus) . ' candidates');

// ------------------------------------------------------------------- stock ---

$salableFloor = static function (array $skus) use ($objectManager, $out, $store): void {
    if (
        !interface_exists(GetProductSalableQtyInterface::class)
        || !interface_exists(SourceItemsSaveInterface::class)
    ) {
        return;
    }

    $stockResolver = $objectManager->get(StockResolverInterface::class);
    $website = $objectManager->get(StoreManagerInterface::class)->getWebsite($store->getWebsiteId());
    $stockId = (int)$stockResolver->execute(SalesChannelInterface::TYPE_WEBSITE, $website->getCode())->getStockId();

    $sourceCodes = array_map(
        static fn($source) => $source->getSourceCode(),
        $objectManager->get(GetSourcesAssignedToStockOrderedByPriorityInterface::class)->execute($stockId),
    );

    $salableQty = $objectManager->get(GetProductSalableQtyInterface::class);
    $sourceItems = $objectManager->get(SourceItemRepositoryInterface::class);
    $searchCriteria = $objectManager->get(SearchCriteriaBuilder::class);
    $save = $objectManager->get(SourceItemsSaveInterface::class);
    $sourceItemFactory = $objectManager->get(SourceItemInterfaceFactory::class);

    $raised = [];
    $created = [];

    foreach ($skus as $sku) {
        try {
            $available = (float)$salableQty->execute($sku, $stockId);
        } catch (Throwable $error) {
            continue;
        }

        if ($available >= TARGET_SALABLE) {
            continue;
        }

        $criteria = $searchCriteria
            ->addFilter(SourceItemInterface::SKU, $sku)
            ->addFilter(SourceItemInterface::SOURCE_CODE, $sourceCodes, 'in')
            ->create();
        $items = array_values($sourceItems->getList($criteria)->getItems());

        if ($items === [] && $sourceCodes !== []) {
            $item = $sourceItemFactory->create();
            $item->setSku($sku);
            $item->setSourceCode($sourceCodes[0]);
            $item->setQuantity(TARGET_SALABLE);
            $item->setStatus(SourceItemInterface::STATUS_IN_STOCK);
            $save->execute([$item]);
            $created[] = $sku;
            continue;
        }

        if ($items === []) {
            continue;
        }

        $item = $items[0];
        $item->setQuantity((float)$item->getQuantity() + (TARGET_SALABLE - $available));
        $item->setStatus(SourceItemInterface::STATUS_IN_STOCK);
        $save->execute([$item]);
        $raised[] = $sku;
    }

    if ($created !== []) {
        $out('stock: opened ' . count($created) . ' sku(s) on source ' . $sourceCodes[0] . ' — they had none in stock ' . $stockId);
    }

    $out(
        $raised === []
            ? 'stock: every candidate is above the floor on stock ' . $stockId
            : 'stock: topped up ' . count($raised) . ' sku(s) on stock ' . $stockId,
    );
};

$salableFloor(array_values(array_unique(array_merge($skus, [CHECKOUT_SKU]))));

// ---------------------------------------------------------------- wishlist ---

$wishlist = $objectManager->get(WishlistFactory::class)->create()->loadByCustomerId($customerId, true);
$have = (int)$wishlist->getItemCollection()->getSize();

if ($have < TARGET_WISHLIST) {
    $productRepository = $objectManager->get(ProductRepositoryInterface::class);
    $added = 0;

    foreach ($skus as $sku) {
        if ($have + $added >= TARGET_WISHLIST) {
            break;
        }
        try {
            $wishlist->addNewItem($productRepository->get($sku, false, (int)$store->getId()));
            $added++;
        } catch (Throwable $error) {
            $out('  wishlist skip ' . $sku . ': ' . $error->getMessage());
        }
    }

    $wishlist->save();
    $out('wishlist: added ' . $added . ' (had ' . $have . ')');
} else {
    $out('wishlist: ' . $have . ' already there');
}

// ----------------------------------------------------------------- reviews ---

$reviewFactory = $objectManager->get(ReviewFactory::class);
$ratingFactory = $objectManager->get(RatingFactory::class);

$reviewCount = (int)$connection->fetchOne(
    $connection->select()
        ->from($connection->getTableName('review_detail'), 'COUNT(*)')
        ->where('customer_id = ?', $customerId)
);

if ($reviewCount < TARGET_REVIEWS) {
    $ratings = $ratingFactory->create()->getResourceCollection()->addEntityFilter('product')
        ->setStoreFilter((int)$store->getId())->setActiveFilter(true)->load();
    $productRepository = $objectManager->get(ProductRepositoryInterface::class);
    $written = 0;

    foreach ($skus as $index => $sku) {
        if ($reviewCount + $written >= TARGET_REVIEWS) {
            break;
        }

        $product = $productRepository->get($sku, false, (int)$store->getId());
        $review = $reviewFactory->create()->setData([
            'nickname' => FIRST_NAME,
            'title' => 'Holds up',
            'detail' => 'Second season with it and it still looks like the first day. Sizing runs true.',
            'entity_pk_value' => (int)$product->getId(),
            'status_id' => 1,
            'customer_id' => $customerId,
            'store_id' => (int)$store->getId(),
            'stores' => [0, (int)$store->getId()],
        ]);
        $review->setEntityId($review->getEntityIdByCode('product'))->save();
        $review->aggregate();

        foreach ($ratings as $rating) {
            $options = array_values($rating->getOptions() ?: []);
            if (!$options) {
                continue;
            }
            $option = $options[min(3, count($options) - 1)];
            $ratingFactory->create()
                ->setRatingId($rating->getId())
                ->setReviewId($review->getId())
                ->setCustomerId($customerId)
                ->addOptionVote((int)$option->getId(), (int)$product->getId());
        }

        $written++;
    }

    $out('reviews: wrote ' . $written . ' (had ' . $reviewCount . ')');
} else {
    $out('reviews: ' . $reviewCount . ' already there');
}

$hostileProduct = $objectManager->get(ProductRepositoryInterface::class)
    ->get($skus[0], false, (int)$store->getId());
$hostileTitle = '<!--<script>';

$hasHostile = (int)$connection->fetchOne(
    $connection->select()
        ->from(['d' => $connection->getTableName('review_detail')], 'COUNT(*)')
        ->join(['r' => $connection->getTableName('review')], 'r.review_id = d.review_id', [])
        ->where('d.title = ?', $hostileTitle)
        ->where('r.entity_pk_value = ?', (int)$hostileProduct->getId())
);

if (!$hasHostile) {
    $hostile = $reviewFactory->create()->setData([
        'nickname' => 'Tokenizer probe',
        'title' => $hostileTitle,
        'detail' => 'Fixture review: its title must never reach the page unescaped.',
        'entity_pk_value' => (int)$hostileProduct->getId(),
        'status_id' => 1,
        'store_id' => (int)$store->getId(),
        'stores' => [0, (int)$store->getId()],
    ]);
    $hostile->setEntityId($hostile->getEntityIdByCode('product'))->save();
    $hostile->aggregate();
}

$hostileUrl = parse_url((string)$hostileProduct->getProductUrl(), PHP_URL_PATH);
$out('reviews: tokenizer probe on ' . $hostileUrl);

// ------------------------------------------------------------------ orders ---

$orderCollection = $objectManager->get(OrderCollectionFactory::class)->create()
    ->addFieldToFilter('customer_id', $customerId);
$orderCount = (int)$orderCollection->getSize();

if ($orderCount < TARGET_ORDERS) {
    $cartManagement = $objectManager->get(CartManagementInterface::class);
    $cartRepository = $objectManager->get(CartRepositoryInterface::class);
    $productRepository = $objectManager->get(ProductRepositoryInterface::class);
    $placed = 0;

    while ($orderCount + $placed < TARGET_ORDERS) {
        $sku = $skus[($orderCount + $placed) % count($skus)];

        try {
            $quote = $cartRepository->get($cartManagement->createEmptyCartForCustomer($customerId));
            $quote->setStore($store);
            $quote->addProduct($productRepository->get($sku, false, (int)$store->getId()), 1);

            $quote->getBillingAddress()->addData($address);
            $quote->getShippingAddress()->addData($address)
                ->setCollectShippingRates(true)
                ->collectShippingRates()
                ->setShippingMethod('flatrate_flatrate');

            $quote->setPaymentMethod('checkmo');
            $quote->setInventoryProcessed(false);
            $quote->collectTotals();
            $quote->getPayment()->importData(['method' => 'checkmo']);
            $cartRepository->save($quote);

            $cartManagement->placeOrder($quote->getId());
            $placed++;
        } catch (Throwable $error) {
            $out('! order failed on ' . $sku . ': ' . $error->getMessage());
            break;
        }
    }

    $out('orders: placed ' . $placed . ' (had ' . $orderCount . ')');
} else {
    $out('orders: ' . $orderCount . ' already there');
}

$orders = $objectManager->get(OrderCollectionFactory::class)->create()
    ->addFieldToFilter('customer_id', $customerId)
    ->setOrder('entity_id', 'DESC')
    ->setPageSize(ORDER_WINDOW)
    ->load();

$orderRepository = $objectManager->get(OrderRepositoryInterface::class);
$byOffset = array_values($orders->getItems());

$documented = null;

foreach ($byOffset as $order) {
    if ($order->hasCreditmemos()) {
        $documented = $order;
        break;
    }
}

$documented ??= $byOffset[DOCUMENTED_OFFSET] ?? null;
$documentedId = $documented ? (int)$documented->getEntityId() : null;

$forcedCount = 0;

foreach ($byOffset as $offset => $order) {
    $forced = FORCED_STATES[$offset] ?? null;
    if (!$forced || $order->getState() === $forced['state']) {
        continue;
    }
    if ($order->hasCreditmemos() || (int)$order->getEntityId() === $documentedId) {
        continue;
    }
    $order->setState($forced['state'])->setStatus($forced['status']);
    $orderRepository->save($order);
    $forcedCount++;
}
$out('orders: chip tones forced on ' . $forcedCount);

if ($documented) {
    $order = $orderRepository->get($documentedId);

    try {
        if (!$order->hasInvoices()) {
            // A forced state from an earlier run refuses to be invoiced; hand the
            // order back to where it was placed before asking for documents.
            if (!in_array($order->getState(), ['new', 'processing'], true)) {
                $order->setState('new')->setStatus('pending');
                $orderRepository->save($order);
                $order = $orderRepository->get($documentedId);
            }
            $objectManager->get(InvoiceOrderInterface::class)->execute($documentedId, true);
            $order = $orderRepository->get($documentedId);
        }
        if (!$order->hasShipments() && $order->canShip()) {
            $objectManager->get(ShipOrderInterface::class)->execute($documentedId);
            $order = $orderRepository->get($documentedId);
        }
        if (!$order->hasCreditmemos()) {
            $invoices = array_values($order->getInvoiceCollection()->getItems());
            if ($invoices) {
                $creditmemo = $objectManager->get(CreditmemoFactory::class)->createByInvoice($invoices[0]);
                // 2.4.9 declares the quantity validator strict while the model still
                // hands it the string it read from the database, so the refund dies
                // on its own data unless the quantities are cast first.
                foreach ($creditmemo->getAllItems() as $item) {
                    $item->setQty((float)$item->getQty());
                }
                $objectManager->get(CreditmemoManagementInterface::class)->refund($creditmemo, true);
            }
        }
        $out('orders: #' . $order->getIncrementId() . ' invoiced, shipped and refunded');
    } catch (Throwable $error) {
        $out('! documents failed on #' . $order->getIncrementId() . ': ' . $error->getMessage());
    }
}

$trackableId = null;

foreach ($byOffset as $order) {
    $current = $orderRepository->get((int)$order->getEntityId());
    if ((int)$current->getEntityId() === $documentedId) {
        continue;
    }
    if (in_array($current->getState(), ['closed', 'canceled'], true) || $current->hasCreditmemos()) {
        continue;
    }
    if (!in_array($current->getState(), ['processing', 'complete'], true)) {
        $current->setState('processing')->setStatus('processing');
        $orderRepository->save($current);
    }
    $trackableId = (int)$current->getEntityId();
    break;
}

$out(
    $trackableId
        ? 'orders: track fixture is #' . $orderRepository->get($trackableId)->getIncrementId()
        : '! no order left in motion for the track specs',
);

// ------------------------------------------------------------------ captcha --

// Magento demands a CAPTCHA after a few failed sign-ins and the theme renders
// none, so a stale lockout silently breaks the auth fixture.
// Magento demands a CAPTCHA after a few sign-ins and the theme renders none, so
// the account locks itself out mid-suite. Off for this environment until the
// login template grows the challenge; the gap itself is carried by a fixme in
// specs/auth.guest.spec.ts rather than papered over.
$connection->delete($connection->getTableName('captcha_log'));
$objectManager->get(\Magento\Framework\App\Config\Storage\WriterInterface::class)
    ->save('customer/captcha/enable', '0');
$objectManager->get(\Magento\Framework\App\Cache\TypeListInterface::class)->cleanType('config');
$out('captcha: lockout cleared and the storefront challenge switched off');

// ----------------------------------------------------------------- handover ---

// The reset-password screen is unreachable without a live token, and the token
// only ever travels by email. Minting one here is what makes that page testable.
$resetToken = bin2hex(random_bytes(16));
$customerModel = $customerRegistry->retrieve($customerId);
$customerModel->changeResetPasswordLinkToken($resetToken);
$customerModel->save();


const VIRTUAL_SKU = 'OBSIDIAN-E2E-VIRTUAL';

$catalogRepository = $objectManager->get(ProductRepositoryInterface::class);

$urlKeyOf = static function (int $productId) use ($connection): ?string {
    $value = $connection->fetchOne(
        'SELECT v.value FROM catalog_product_entity_varchar v'
        . ' JOIN eav_attribute a ON a.attribute_id = v.attribute_id AND a.attribute_code = \'url_key\''
        . ' WHERE v.entity_id = ? AND v.store_id = 0',
        [$productId]
    );
    return $value !== false && $value !== null && $value !== '' ? (string)$value : null;
};

$firstOfType = static function (string $type) use ($connection, $urlKeyOf): ?array {
    $rows = $connection->fetchAll(
        'SELECT e.entity_id, e.sku FROM catalog_product_entity e'
        . ' JOIN catalog_product_website w ON w.product_id = e.entity_id'
        . ' JOIN catalog_product_entity_int st ON st.entity_id = e.entity_id AND st.store_id = 0'
        . ' JOIN eav_attribute sta ON sta.attribute_id = st.attribute_id AND sta.attribute_code = \'status\''
        . ' JOIN catalog_product_entity_int vi ON vi.entity_id = e.entity_id AND vi.store_id = 0'
        . ' JOIN eav_attribute via ON via.attribute_id = vi.attribute_id AND via.attribute_code = \'visibility\''
        . ' JOIN cataloginventory_stock_status ss ON ss.product_id = e.entity_id AND ss.stock_status = 1'
        . ' WHERE e.type_id = ? AND st.value = 1 AND vi.value IN (2, 4)'
        . ' ORDER BY e.entity_id LIMIT 10',
        [$type]
    );

    foreach ($rows as $row) {
        $urlKey = $urlKeyOf((int)$row['entity_id']);
        if ($urlKey !== null) {
            return ['sku' => (string)$row['sku'], 'urlKey' => $urlKey, 'id' => (int)$row['entity_id']];
        }
    }
    return null;
};

$withDecimalAttribute = static function (string $attributeCode) use ($connection, $urlKeyOf): ?array {
    $row = $connection->fetchRow(
        'SELECT e.entity_id, e.sku FROM catalog_product_entity e'
        . ' JOIN catalog_product_entity_decimal d ON d.entity_id = e.entity_id'
        . ' JOIN eav_attribute a ON a.attribute_id = d.attribute_id AND a.attribute_code = ?'
        . ' WHERE d.value IS NOT NULL AND d.value > 0 LIMIT 1',
        [$attributeCode]
    );
    if (!$row) {
        return null;
    }
    $urlKey = $urlKeyOf((int)$row['entity_id']);
    return $urlKey === null ? null : ['sku' => (string)$row['sku'], 'urlKey' => $urlKey, 'id' => (int)$row['entity_id']];
};

$fixedProductTax = static function () use ($connection, $urlKeyOf): ?array {
    $row = $connection->fetchRow(
        'SELECT e.entity_id, e.sku FROM weee_tax w JOIN catalog_product_entity e ON e.entity_id = w.entity_id LIMIT 1'
    );
    if (!$row) {
        return null;
    }
    $urlKey = $urlKeyOf((int)$row['entity_id']);
    return $urlKey === null ? null : ['sku' => (string)$row['sku'], 'urlKey' => $urlKey, 'id' => (int)$row['entity_id']];
};

$ensureVirtual = static function () use ($objectManager, $catalogRepository, $urlKeyOf, $out): ?array {
    try {
        $product = $catalogRepository->get(VIRTUAL_SKU);
    } catch (NoSuchEntityException) {
        $product = $objectManager->create(\Magento\Catalog\Model\Product::class);
        $product->setSku(VIRTUAL_SKU)
                ->setName('Obsidian E2E Virtual Session')
                ->setTypeId(\Magento\Catalog\Model\Product\Type::TYPE_VIRTUAL)
                ->setAttributeSetId(4)
                ->setPrice(29.0)
                ->setVisibility(Visibility::VISIBILITY_BOTH)
                ->setStatus(1)
                ->setUrlKey('obsidian-e2e-virtual-session')
                ->setWebsiteIds([1])
                ->setStockData(['use_config_manage_stock' => 1, 'qty' => 999, 'is_in_stock' => 1]);
        $product = $catalogRepository->save($product);
        $out('products: minted the virtual product the catalogue lacks');
    }

    $urlKey = $urlKeyOf((int)$product->getId()) ?? 'obsidian-e2e-virtual-session';
    return ['sku' => (string)$product->getSku(), 'urlKey' => $urlKey, 'id' => (int)$product->getId()];
};

$productFixtures = [
    'simple' => $firstOfType('simple'),
    'configurable' => $firstOfType('configurable'),
    'bundle' => $firstOfType('bundle'),
    'grouped' => $firstOfType('grouped'),
    'downloadable' => $firstOfType('downloadable'),
    'virtual' => $ensureVirtual(),
    'msrp' => $withDecimalAttribute('msrp'),
    'fpt' => $fixedProductTax(),
];

$childrenOf = static function (array $fixture) use ($connection): array {
    $bundle = $connection->fetchCol(
        'SELECT e.sku FROM catalog_product_bundle_selection s'
        . ' JOIN catalog_product_entity e ON e.entity_id = s.product_id'
        . ' WHERE s.parent_product_id = ?',
        [$fixture['id']]
    );
    $grouped = $connection->fetchCol(
        'SELECT e.sku FROM catalog_product_link l'
        . ' JOIN catalog_product_entity e ON e.entity_id = l.linked_product_id'
        . ' WHERE l.product_id = ? AND l.link_type_id = 3',
        [$fixture['id']]
    );
    return array_map('strval', array_merge($bundle, $grouped));
};

$fixtureSkus = [];
foreach ($productFixtures as $fixture) {
    if ($fixture === null) {
        continue;
    }
    $fixtureSkus[] = $fixture['sku'];
    $fixtureSkus = array_merge($fixtureSkus, $childrenOf($fixture));
}
$salableFloor(array_values(array_unique($fixtureSkus)));

foreach ($productFixtures as $role => $fixture) {
    $out($fixture === null
        ? 'products: no ' . $role . ' product in this catalogue — its specs will skip'
        : 'products: ' . $role . ' is ' . $fixture['sku'] . ' (/' . $fixture['urlKey'] . '.html)');
}

$handover = dirname(__DIR__) . '/.artifacts';
if (!is_dir($handover)) {
    mkdir($handover, 0o775, true);
}

file_put_contents(
    $handover . '/fixture.json',
    json_encode([
        'customerId' => $customerId,
        'email' => EMAIL,
        'password' => $password,
        'resetToken' => $resetToken,
        'orders' => TARGET_ORDERS,
        'wishlist' => TARGET_WISHLIST,
        'reviews' => TARGET_REVIEWS,
        'documentedOrderId' => $documentedId,
        'trackableOrderId' => $trackableId,
        'hostileReviewUrl' => $hostileUrl,
        'products' => $productFixtures,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"
);
$out('handover: tests/e2e/.artifacts/fixture.json');

$out('');
$out('ready — ' . EMAIL . ' (password in .artifacts/fixture.json)');
