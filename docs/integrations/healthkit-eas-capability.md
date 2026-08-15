# HealthKit EAS capability sync

Wave 1 iOS builds need HealthKit **and** background delivery. EAS app-id
capability auto-sync does **not** include
`com.apple.developer.healthkit.background-delivery`.

Budget a half-day for this trap before the first TestFlight gate.

## First-build failure

The usual first EAS iOS build fails with:

`Provisioning profile doesn't support the HealthKit capability`

or a missing background-delivery entitlement after the HealthKit capability
appears to sync.

## Inspect capability sync

```bash
EXPO_DEBUG=1 eas build --platform ios --profile preview
```

Read the capability-sync logs for whether HealthKit was patched onto the App
ID and whether background delivery was skipped.

## Escape hatches

Hand-manage App ID capability state when auto-sync is wrong:

```bash
EXPO_NO_CAPABILITY_SYNC=1 eas build --platform ios --profile preview
```

Then in the Apple Developer portal, enable:

- HealthKit
- HealthKit Background Delivery
- Background Modes: fetch / processing as required by the HealthKit plugin

Rebuild after the portal state matches `apps/mobile/app.json` entitlements.

## Config in this repo

`apps/mobile/app.json` sets:

- `@kingstinct/react-native-healthkit` with `background: true`
- `ios.entitlements["com.apple.developer.healthkit"]`
- `ios.entitlements["com.apple.developer.healthkit.background-delivery"]`

Do not treat an Expo Go or simulator-only run as validation. Use a physical
device TestFlight build.
