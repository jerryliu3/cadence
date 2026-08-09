import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "Use a typed API client wrapper instead of raw fetch in feature modules.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(insert|update|upsert|delete)$/][callee.object.callee.property.name='from'][callee.object.callee.object.name='supabase'][callee.object.arguments.0.value=/^(goals|goal_links|goal_shares|goal_participants|profiles)$/]",
          message:
            "Move browser-side Supabase table writes behind API route handlers.",
        },
      ],
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
