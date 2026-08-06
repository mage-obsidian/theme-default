export interface AccountRoute {
    /** Path relative to the store root. */
    path: string;
    /** The single <h1> the page must render. */
    heading: string | RegExp;
    /** Rail entry that must carry aria-current on this page, when there is one. */
    navLabel?: string;
    /** Routes whose module may not be wired in every environment. */
    optional?: boolean;
}

/**
 * Every account destination the redesign covers. `accountRoutes` drives the shell
 * checks, so adding a page here is enough to hold it to the same contract.
 */
export const accountRoutes: Record<string, AccountRoute> = {
    dashboard: { path: "/customer/account", heading: /^Hello, /, navLabel: "Account Dashboard" },
    orders: { path: "/sales/order/history", heading: "My Orders", navLabel: "My Orders" },
    addresses: { path: "/customer/address", heading: "Address Book", navLabel: "Address Book" },
    edit: { path: "/customer/account/edit", heading: "Account Information", navLabel: "Account Information" },
    newsletter: { path: "/newsletter/manage", heading: "Newsletter Subscriptions", navLabel: "Newsletter Subscriptions" },
    wishlist: { path: "/wishlist", heading: "My Wish List", navLabel: "My Wish List" },
    reviews: { path: "/review/customer", heading: "My Product Reviews", navLabel: "My Product Reviews" },
    downloadables: {
        path: "/downloadable/customer/products",
        heading: "My Downloadable Products",
        navLabel: "My Downloadable Products",
        optional: true,
    },
    vault: {
        path: "/vault/cards/listaction",
        heading: "Stored Payment Methods",
        navLabel: "Stored Payment Methods",
        optional: true,
    },
};

/** The five split-screen authentication pages. `resetpassword` needs a live token. */
export const authRoutes = {
    login: { path: "/customer/account/login", heading: "Sign In" },
    register: { path: "/customer/account/create", heading: "Create an Account" },
    forgot: { path: "/customer/account/forgotpassword", heading: "Reset Your Password" },
    confirmation: { path: "/customer/account/confirmation", heading: "Send confirmation link" },
} as const;
