// This file is part of the MageObsidian - Default Theme project.
//
// SPDX-FileCopyrightText: 2024 Jeanmarcos Juarez
// SPDX-License-Identifier: MIT
export default {
    includeCssSourceFromParentThemes: false,
    ignoredCssFromModules: [],
    ignoredTailwindConfigFromModules: [],
    vue: {
        runtimeOnly: true,
    },
    exposeNpmPackages: [
        {
            package: 'pinia',
            exposePath: 'pinia',
        },
    ],
}
