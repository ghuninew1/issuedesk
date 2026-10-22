import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
    {
        ignores: ["dist/**", ".wrangler/**", "node_modules/**"],
    },
    {
        files: ["**/*.{js,jsx}"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
            },
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...reactHooks.configs.flat.recommended.rules,
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
        },
    },
    {
        files: ["vite.config.js", "eslint.config.js", "garage/storage/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
];
