import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintConfigStandard from "eslint-config-standard";
import importPlugin from "eslint-plugin-import";
import promisePlugin from "eslint-plugin-promise";
import nPlugin from "eslint-plugin-n";

export default [
    {
        files: ["**/*.{js,jsx,ts,tsx}"],
        ignores: ["node_modules/**", "main.js"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                sourceType: "module",
            },
            globals: {
                process: "readonly",
                __dirname: "readonly",
                window: "readonly",
                document: "readonly",
                console: "readonly",
                MouseEvent: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
            "prettier": prettier,
            "import": importPlugin,
            "promise": promisePlugin,
            "n": nPlugin,
        },
        rules: {
            ...eslint.configs.recommended.rules,
            ...tseslint.configs["eslint-recommended"].rules,
            ...tseslint.configs.recommended.rules,
            ...eslintConfigStandard.rules,
            ...eslintConfigPrettier.rules,

            "prettier/prettier": ["error"],

            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { "args": "none" }],
            "@typescript-eslint/ban-ts-comment": "off",
            "no-prototype-builtins": "off",
            "@typescript-eslint/no-empty-function": "off",
            "no-new": "off",
            "no-useless-constructor": "off",
        },
    },
];