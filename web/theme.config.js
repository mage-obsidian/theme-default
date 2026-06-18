export default {
    // CSS/asset inheritance from the parent theme is handled through Magento's
    // theme inheritance; the Obsidian skin defines its own tokens here.
    includeParentThemes: false,
    ignoredCssFromModules: [],
    ignoredTailwindConfigFromModules: [],
    exposeNpmPackages: [
        {
            package: 'pinia',
            exposePath: 'pinia',
        },
    ],
}
