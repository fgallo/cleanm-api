import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // A leading underscore marks a parameter as intentionally unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `declare global { namespace Express { ... } }` is how Express types
      // are extended; a namespace with actual code is still an error.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
    },
  },
);
