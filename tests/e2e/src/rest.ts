export const REST = "/rest/default/V1";

export const AJAX = { "X-Requested-With": "XMLHttpRequest" };

export const SELF_RESOURCES = [
    { name: "the customer's own account", path: `${REST}/customers/me` },
    { name: "the customer's own cart totals", path: `${REST}/carts/mine/totals` },
    { name: "the payment methods on the customer's own cart", path: `${REST}/carts/mine/payment-methods` },
];

export const UNGUESSABLE_MASKS = [
    { name: "a mask nobody minted", value: "thisisnotarealmask000000000000ab" },
    { name: "a quote's numeric id used as a mask", value: "1" },
    { name: "an empty mask", value: "0" },
];

export const rejected = (status: number): boolean => status === 401 || status === 403 || status === 404;
