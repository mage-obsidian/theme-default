export default {
    // The Obsidian skin defines its own tokens and page shell, so the parent
    // theme's CSS source is not prepended to this theme's stylesheet. Template,
    // layout and component inheritance still come from Magento and from the
    // engine's module resolver — this flag only governs CSS source.
    includeCssSourceFromParentThemes: false,
    ignoredCssFromModules: [],
    ignoredTailwindConfigFromModules: [],
    exposeNpmPackages: [
        {
            package: 'pinia',
            exposePath: 'pinia',
        },
    ],
}
