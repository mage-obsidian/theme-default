export interface AccountRoute {
    /** Path relative to the store root. */
    path: string;
    /** The single <h1> the page must render. */
    heading: string | RegExp;
    /** Rail entry that must carry aria-current on this page, when there is one. */
    navLabel?: string;
    /** Routes whose module may not be wired in every environment. */
    optional?: boolean;
    capability: string;
}

/**
 * Every account destination the redesign covers. `accountRoutes` drives the shell
 * checks, so adding a page here is enough to hold it to the same contract.
 */
export const accountRoutes: Record<string, AccountRoute> = {
    dashboard: { path: "/customer/account", heading: /^Hello, /, navLabel: "Account Dashboard", capability: "customer_account_index" },
    orders: { path: "/sales/order/history", heading: "My Orders", navLabel: "My Orders", capability: "sales_order_history" },
    addresses: { path: "/customer/address", heading: "Address Book", navLabel: "Address Book", capability: "customer_address_index" },
    edit: { path: "/customer/account/edit", heading: "Account Information", navLabel: "Account Information", capability: "customer_account_edit" },
    newsletter: { path: "/newsletter/manage", heading: "Newsletter Subscriptions", navLabel: "Newsletter Subscriptions", capability: "newsletter_manage_index" },
    wishlist: { path: "/wishlist", heading: "My Wish List", navLabel: "My Wish List", capability: "wishlist_index_index" },
    reviews: { path: "/review/customer", heading: "My Product Reviews", navLabel: "My Product Reviews", capability: "review_customer_index" },
    downloadables: {
        path: "/downloadable/customer/products",
        heading: "My Downloadable Products",
        navLabel: "My Downloadable Products",
        optional: true,
        capability: "downloadable_customer_products",
    },
    vault: {
        path: "/vault/cards/listaction",
        heading: "Stored Payment Methods",
        navLabel: "Stored Payment Methods",
        optional: true,
        capability: "vault_cards_listaction",
    },
};

/** The five split-screen authentication pages. `resetpassword` needs a live token. */
export const authRoutes = {
    login: { path: "/customer/account/login", heading: "Sign In", capability: "customer_account_login" },
    register: { path: "/customer/account/create", heading: "Create an Account", capability: "customer_account_create" },
    forgot: { path: "/customer/account/forgotpassword", heading: "Reset Your Password", capability: "customer_account_forgotpassword" },
    confirmation: { path: "/customer/account/confirmation", heading: "Send confirmation link", capability: "customer_account_confirmation" },
} as const;
