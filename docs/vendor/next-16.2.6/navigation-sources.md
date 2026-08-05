# Next 16.2.6 Navigation References

This project uses Next `16.2.6` (`node_modules/next/package.json`) and relies on
URL-driven client navigation for the Checklist/Calendar shell.

Consulted references before implementing `useSearchParams` and native history usage:

- Next.js docs: [useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params)
- Next.js docs: [Linking and Navigating (Native History API)](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api)
- Installed typings: `node_modules/next/dist/client/components/navigation.d.ts`
- Installed source: `node_modules/next/dist/client/components/navigation.js`

Notes:

- `useSearchParams` is read-only and must be used from a Client Component.
- `window.history.pushState` and `window.history.replaceState` integrate with Next
  router state and update `useSearchParams`/`usePathname`.
