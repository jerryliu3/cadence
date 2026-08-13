import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local worktrees created during stacked-PR workflows.
    ".worktrees/**",
    // Generated Playwright HTML trace assets.
    "playwright-report/**",
    // Expo Metro config is CommonJS by convention.
    "apps/mobile/metro.config.js",
  ]),
  {
    files: ["packages/shared/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "navigator",
        "localStorage",
        "sessionStorage",
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom"],
          patterns: [
            "next/*",
            "@radix-ui/*",
            "@dnd-kit/*",
            "sonner",
            "lucide-react",
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
