import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const noRawFetchSelectors = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      "Use a typed API client wrapper instead of raw fetch in feature/lib client modules.",
  },
  {
    selector:
      "CallExpression[callee.property.name='fetch'][callee.object.name=/^(window|globalThis)$/]",
    message:
      "Use a typed API client wrapper instead of raw fetch in feature/lib client modules.",
  },
];

// Browser-write lint bans move with the XP/social write-API program.
const noDirectSupabaseWriteSelectors = [];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...noRawFetchSelectors,
        ...noDirectSupabaseWriteSelectors,
      ],
    },
  },
  {
    files: [
      "src/lib/goals/**/*.{ts,tsx}",
      "src/lib/planner/**/*.{ts,tsx}",
      "src/lib/push/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...noRawFetchSelectors],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local worktrees created during stacked-PR workflows.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
