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

const noDirectSupabaseWriteSelectors = [
  {
    // notification_schedules is intentionally excluded in this recut and
    // remains owned by the XP/social write-API follow-up branch.
    selector:
      "CallExpression[callee.property.name=/^(insert|update|upsert|delete)$/][callee.object.callee.property.name='from'][callee.object.arguments.0.type='Literal'][callee.object.arguments.0.value=/^(goals|goal_links|goal_shares|goal_participants|profiles)$/]",
    message:
      "Move browser-side Supabase table writes behind API route handlers.",
  },
];

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
