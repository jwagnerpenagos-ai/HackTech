// @ts-check
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";

export default tseslint.config(
  {
    // El propio archivo de config no se lintea con reglas con tipos.
    ignores: ["dist/**", "node_modules/**", "coverage/**", "eslint.config.js"],
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js", "vitest.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "no-console": "error",
      eqeqeq: ["error", "always"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },
);
