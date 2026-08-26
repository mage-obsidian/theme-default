import type { EmissionContext, ValueOrigin } from "./unescaped.ts";

export interface Rule {
    name: string;
    matches: RegExp;
    contexts?: EmissionContext[];
    origin: ValueOrigin;
    reason: string;
    guarantee?: string;
}

export const RULES: Rule[] = [
    {
        name: "form-key-block",
        matches: /^block\.getBlockHtml\('\.\.\.'\)$/,
        contexts: ["text"],
        origin: "core-block",
        reason:
            "Magento_Page's formkey block emits a hidden input holding the session token; the only value in it is the token the framework minted, and nothing a shopper types reaches it",
        guarantee: "Magento\\Framework\\Data\\Form\\FormKey\\Block\\Formkey renders a fixed template around a generated token",
    },
    {
        name: "composed-child-markup",
        matches:
            /^(child_html\(|block\.getChildHtml\(|block\.getChildBlock\(|block\.getCmsBlockHtml\(|block\.getToolbarHtml\(|block\.getPagerHtml\(|block\.getAdditionalHtml\(|block\.getPaymentHtml\(|block\.getProductListHtml\(|block\.getItemHtml\(|bundle\.getOptionHtml\(|addInfo\.setItem\(|block\.getImage\(|block\.getAddressesHtmlSelect\(|history\.getPagerHtml\(|block\.getChildHtmlWithExclusions\(|pager$|methodHtml$)/,
        contexts: ["text"],
        origin: "core-block",
        reason:
            "markup another block already rendered: the value is a whole HTML fragment, so escaping it would print tags instead of drawing them, and each block is responsible for escaping its own values",
    },
    {
        name: "price-renderer",
        matches:
            /^(order\.formatPrice\(|block\.getItemPrice\(|block\.getProductPrice\(|grouped\.getProductPrice\(|view\.getPriceHtml\(|block\.getShippingPriceInclTax\(|block\.getShippingPrice\(|latest\.formatPrice\(|item\.getOrder\(\)\.formatPrice\(|block\.formatValue\(|block\.renderTotals\()/,
        contexts: ["text"],
        origin: "core-block",
        reason:
            "currency markup built by Magento's price renderer from numbers and the store's currency format; no free text reaches it",
    },
    {
        name: "address-renderer-html-format",
        matches:
            /^(info\.getFormattedAddress\(|printBlock\.formatAddress\(|book\.getAddressHtml\(|data\.getAddressHtml\(|block\.getAddressAsHtml\(|address\.getPrimary(Billing|Shipping)AddressHtml\(|address\.format\(|block\.getBillingAddress\(\)\.format\(|printBlock\.getShipmentAddressFormattedHtml\(|printBlock\.getBillingAddressFormattedHtml\()/,
        contexts: ["text"],
        origin: "user-input",
        reason:
            "the shopper types their own name, street and city, so this is end-user content — but every one of these calls asks for the html format, and Magento escapes each field before filling the format template",
        guarantee:
            "Magento\\Customer\\Block\\Address\\Renderer\\DefaultRenderer::renderArray escapes every field when the format declares escapeHtml, and module-customer/etc/address_formats.xml declares escapeHtml=\"true\" on the html format",
    },
    {
        name: "theme-icon",
        matches: /^(hero_icon\(|vite\.getHeroIcon\()/,
        contexts: ["text"],
        origin: "theme-helper",
        reason:
            "inlines an SVG file that ships with the theme, chosen by name; the value is a file the repository contains, never anything a request carries",
    },
    {
        name: "translated-literal",
        matches: /^__\('\.\.\.'/,
        contexts: ["text"],
        origin: "store-config",
        reason:
            "a translated literal from the theme's own dictionary, emitted unescaped because the translation carries markup on purpose",
    },
    {
        name: "php-composed-child-markup",
        matches:
            /^(\$block->getChildHtml\(|\$block->getBlockHtml\(|\$block->getChildHtmlWithExclusions\(|\$block->getRealPriceHtml\(|\$_menuHtml$|\$html$|\$headContent$|\$headAdditional$|\$layoutContent$|\$label$)/,
        contexts: ["text"],
        origin: "core-block",
        reason:
            "markup another block already rendered, in one of the templates this theme still keeps in PHP; escaping it would print tags instead of drawing them",
    },
    {
        name: "php-page-shell-attributes",
        matches: /^(\$htmlAttributes$|\$headAttributes$|\$bodyAttributes$)/,
        contexts: ["tag"],
        origin: "core-block",
        reason:
            "the attribute strings Magento's page config assembles for the root elements; they are whole attributes rather than attribute values, and the layout is the only thing that writes them",
    },
    {
        name: "php-price-renderer",
        matches:
            /^(\$msrpPrice$|\$block->renderWeeeTaxAttributeWithTax\(|\$block->renderWeeeTaxAttributeWithoutTax\(|\$block->getFinalAmount\(|\$block->getRawFinalAmount\()/,
        contexts: ["text", "attribute"],
        origin: "core-block",
        reason:
            "currency markup built by Magento's price renderer from numbers and the store's currency format; no free text reaches it",
    },
    {
        name: "php-secure-renderer",
        matches: /^\$secureRenderer->renderTag\(/,
        contexts: ["text"],
        origin: "theme-helper",
        reason:
            "Magento\\Framework\\View\\Helper\\SecureHtmlRenderer builds the tag itself and is the platform's own way of emitting one that a content security policy can allow",
        guarantee: "the helper escapes the attributes it is given and owns the tag it writes",
    },
    {
        name: "php-escaped-at-assignment",
        matches:
            /^(\$attributeName$|\$quickSearchUrl$|\$styleHref$|\$helper->getEscapedQueryText\(|nl2br\(\$escaper->escapeHtml\(|'\.\.\.' \. \$escaper->escapeHtmlAttr\()/,
        contexts: ["text", "attribute", "tag"],
        origin: "user-input",
        reason:
            "a value that was escaped where it was assigned rather than where it is printed, which is why the echo carries no escaper call of its own",
        guarantee:
            "each one is assigned through an escaper in the same template: $attributeName through $block->escapeHtml, $quickSearchUrl and $styleHref through escapeUrl, and the search text through Magento\\Search\\Helper\\Data::getEscapedQueryText",
    },
];

export const ruleFor = (expression: string, context: EmissionContext): Rule | null =>
    RULES.find((rule) => rule.matches.test(expression) && (rule.contexts ?? []).includes(context)) ?? null;
