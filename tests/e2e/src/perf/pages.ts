import type { Page } from "@playwright/test";
import { addToCart } from "../checkout.ts";

export interface PageUnderBudget {
    name: string;
    path: string;
    protocol: string;
    cacheable: boolean;
    capability: string;
    prepare?: (page: Page) => Promise<void>;
}

export const GUEST_PAGES: PageUnderBudget[] = [
    { name: "home", path: "/", protocol: "warm-guest-desktop", cacheable: true, capability: "cms_index_index" },
    { name: "plp", path: "/gear/bags.html", protocol: "warm-guest-desktop", cacheable: true, capability: "catalog_category_view" },
    { name: "pdp", path: "/joust-duffle-bag.html", protocol: "warm-guest-desktop", cacheable: true, capability: "catalog_product_view" },
    { name: "search", path: "/catalogsearch/result/?q=bag", protocol: "warm-guest-desktop", cacheable: true, capability: "catalogsearch_result_index" },
    {
        name: "cart",
        path: "/checkout/cart/",
        protocol: "warm-guest-desktop",
        cacheable: false,
        capability: "checkout_cart_index",
        prepare: (page) => addToCart(page),
    },
    {
        name: "checkout",
        path: "/checkout/",
        protocol: "warm-guest-desktop",
        cacheable: true,
        capability: "checkout_index_index",
        prepare: (page) => addToCart(page),
    },
];

export const COLD_PAGES: PageUnderBudget[] = GUEST_PAGES.filter((entry) => entry.cacheable).map((entry) => ({
    ...entry,
    name: `${entry.name}-cold`,
    protocol: "cold-guest-desktop",
}));

export const ACCOUNT_PAGES: PageUnderBudget[] = [
    { name: "account", path: "/customer/account", protocol: "warm-customer-desktop", cacheable: false, capability: "customer_account_index" },
    { name: "account-orders", path: "/sales/order/history", protocol: "warm-customer-desktop", cacheable: false, capability: "sales_order_history" },
];
