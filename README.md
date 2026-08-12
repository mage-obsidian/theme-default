# MageObsidian — OBSIDIAN (Default Theme)

[![Latest Version](https://img.shields.io/packagist/v/mage-obsidian/theme-default.svg?style=flat-square)](https://packagist.org/packages/mage-obsidian/theme-default)
[![License](https://img.shields.io/packagist/l/mage-obsidian/theme-default.svg?style=flat-square)](https://packagist.org/packages/mage-obsidian/theme-default)

[![Star MageObsidian](https://img.shields.io/github/stars/mage-obsidian/module-modern-frontend?style=flat-square&label=Star%20the%20core%20repo&logo=github)](https://github.com/mage-obsidian/module-modern-frontend)

📚 [Documentation](https://mage-obsidian.jeanmarcos.dev/) · 🚀 [Live demo](https://mage-obsidian-demo.jeanmarcos.dev/) · 💬 [Discussions](https://github.com/mage-obsidian/module-modern-frontend/discussions)

**OBSIDIAN** — the default [MageObsidian](https://mage-obsidian.jeanmarcos.dev/) storefront theme for Magento 2, built with Vite, Tailwind CSS 4, Vue islands and Twig components. See it live at the [demo store](https://mage-obsidian-demo.jeanmarcos.dev/) (Lighthouse 100/100/100/100).

## Installation

```bash
composer require mage-obsidian/theme-default
bin/magento setup:upgrade
bin/magento mage-obsidian:frontend:config --generate
```

Then rebuild your theme (`mage-obsidian:build-themes`). Full guide: [documentation](https://mage-obsidian.jeanmarcos.dev/).

## Why four templates are still `.phtml`

The theme is Twig throughout, with four deliberate exceptions. Each one exists to
fix a defect in the core template it replaces, and each says so in its own header:

| Template | What it fixes |
|---|---|
| `Magento_Msrp::product/price/msrp.phtml` | The native MAP popup needs RequireJS; its inline scripts leak as visible text. Re-expressed as a native `<details>`. |
| `Magento_OfflinePayments::info/checkmo.phtml` | The native template emits a `<dl>` with no `<dd>` unless the check details are configured — a WCAG 1.3.1 violation axe flags. |
| `Magento_Weee::pricing/adjustment.phtml` | The FPT label lives only in `data-label` and needs the core Weee JS, which this stack suppresses. Rendered as visible text instead. |
| `Magento_Newsletter::subscribe.phtml` | Restyled for the dark footer. |

Migrating one to Twig without carrying its fix across reintroduces the defect.

## Support the project

If MageObsidian saves you time, consider [buying me a coffee](https://ko-fi.com/Q5Q816Z9WN). ❤️
