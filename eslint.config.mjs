import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

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
                // node 环境
                process: "readonly",
                __dirname: "readonly",
                // 浏览器环境
                window: "readonly",
                document: "readonly",
                console: "readonly",
                MouseEvent: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
        },
        rules: {
            // 继承推荐规则
            ...eslint.configs.recommended.rules,
            ...tseslint.configs["eslint-recommended"].rules,
            ...tseslint.configs.recommended.rules,

            // 自定义规则
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { "args": "none" }],
            "@typescript-eslint/ban-ts-comment": "off",
            "no-prototype-builtins": "off",
            "@typescript-eslint/no-empty-function": "off",
        },
    },
]; 