<p align="center">
  <a href="https://www.revnix.io"><img src="https://www.revnix.io/sdk/logo.png" width="360" alt="Revnix"></a>
</p>

<h1 align="center">Subscriptions, Paywalls and Attribution<br>for Your Capacitor App</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/revnix-capacitor"><img src="https://img.shields.io/npm/v/revnix-capacitor?color=2f6fe0&logo=npm" alt="npm version"></a>
  <a href="https://github.com/Oth-tech/RevnixSDK-Capacitor/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/revnix-capacitor?color=2f6fe0" alt="license"></a>
  <img src="https://img.shields.io/badge/TypeScript-ready-2f6fe0?logo=typescript&logoColor=white" alt="TypeScript">
</p>

<p align="center">
  <a href="https://www.revnix.io"><b>Website</b></a> •
  <a href="https://www.revnix.io/docs/capacitor"><b>Docs</b></a> •
  <a href="https://www.revnix.io/docs/capacitor/reference"><b>API Reference</b></a>
</p>

![Revnix: subscriptions, paywalls and attribution for mobile apps](https://www.revnix.io/sdk/hero.png)

Revnix SDK makes in-app subscriptions, paywalls and attribution for Capacitor fast and easy. One plugin buys through StoreKit 2 and Google Play Billing, validates the receipt on the server and unlocks the entitlement. No separate IAP plugin.

## Table of Contents

- [Why Revnix?](#why-revnix)
- [Getting Started](#getting-started)
- [Quick start](#quick-start)
- [Purchases and entitlements without server code](#purchases-and-entitlements-without-server-code)
- [Paywalls that update without app releases](#paywalls-that-update-without-app-releases)
- [A/B tests with a built-in holdout](#ab-tests-with-a-built-in-holdout)
- [Attribution and deep links](#attribution-and-deep-links)
- [Real-time analytics for your Capacitor app](#real-time-analytics-for-your-capacitor-app)
- [Platform Support](#platform-support)
- [Documentation](#documentation)
- [Migrating from another SDK](#migrating-from-another-sdk)
- [Support](#support)
- [License](#license)

## Why Revnix?

- [Purchases in one call](https://www.revnix.io/docs/capacitor/make-purchases). `Revnix.purchase()` opens the App Store or Google Play sheet, validates the receipt on the server and grants the entitlement. No IAP plugin, no server code.
- [Entitlements that work offline](https://www.revnix.io/docs/capacitor/check-entitlements). Entitlement checks are cached on device, so a user who paid stays unlocked without a network.
- [Remote paywalls](https://www.revnix.io/docs/paywall-builder). Design paywalls in the dashboard, pick from 250 templates and ship copy, prices and layout changes without an app release.
- [A/B tests and holdouts](https://www.revnix.io/docs/ab-tests). Split a placement between variants, measure revenue per user with credible intervals and ship the winner from the dashboard.
- [Attribution and deep links](https://www.revnix.io/docs/attribution). Install attribution, deferred deep links, Apple Search Ads, Google Ads and MMP forwarding, all from the same plugin.
- [Integrations](https://www.revnix.io/docs/integrations). Send subscription events to analytics, attribution and messaging tools, or to your own server through signed webhooks.
- [Real-time analytics](https://www.revnix.io/docs/analytics). Revenue, MRR, LTV, ROAS, cohorts and funnels for iOS and Android, filtered by store, product, channel and campaign.

## Getting Started

```sh
npm install revnix-capacitor
npx cap sync
```

The native Swift and Kotlin SDKs ship inside the plugin and compile with your app. There is nothing else to add on iOS or Android.

Read the [installation guide](https://www.revnix.io/docs/capacitor/installation) and [configuration reference](https://www.revnix.io/docs/capacitor/configuration) to set up the plugin.

## Quick start

```ts
import { Revnix } from 'revnix-capacitor';

// 1. Configure once at app start
await Revnix.configure({
  apiKey: 'rvx_pk_live_…',
  baseUrl: 'https://<your-deployment>.convex.site',
});

// 2. Buy: opens the store sheet, validates the receipt, grants the entitlement
const { result } = await Revnix.purchase({ productId: 'pro.monthly' });
if (result) await Revnix.waitForEntitlements({ seq: result.seq });

// 3. Check access anywhere
const { entitled } = await Revnix.isEntitled({ entitlementId: 'pro' });
```

Your API key and deployment URL are in the dashboard under Settings. See [API keys](https://www.revnix.io/docs/api-keys).

On Android, `collectAdvertisingId: true` in `configure` opts in to Google Advertising ID collection. Add `com.google.android.gms:play-services-ads-identifier` and the `com.google.android.gms.permission.AD_ID` permission to your app; when limit-ad-tracking is on no id is sent and a previously sent id is cleared; if play-services-ads-identifier is missing no id is collected and the `diagnostic` listener (`addListener('diagnostic', …)`) reports it. Ignored on iOS and web.

## Purchases and entitlements without server code

**Revnix handles the hard parts of subscriptions in a small, developer-friendly plugin.**

- `purchase({ productId })` runs the whole flow: store sheet, server-side receipt validation, entitlement, transaction finish. `restore()` brings purchases back on a new device.
- Renewals, purchases on other devices and Ask to Buy approvals arrive on their own and are registered automatically.
- Entitlements and placements are cached on device, so paid users stay unlocked offline.
- Failed registrations are queued durably and retried on the next launch.
- Typed errors: `purchase_blocked`, `product_not_found`, `store_error` and more, each with `isRetryable`. See [Make purchases](https://www.revnix.io/docs/capacitor/make-purchases).
- Already using your own store plugin? Keep it and call `registerPurchase()` instead.

## Paywalls that update without app releases

![Revnix paywall builder: element tree, background library and a live iPhone preview](https://www.revnix.io/sdk/react-native/paywalls.png)

With the [Revnix paywall builder](https://www.revnix.io/docs/paywall-builder) you design the paywall in the dashboard and render it in your app.

- **One renderer for every platform**: `renderRevnixPaywall` draws the published design as plain DOM inside your WebView, no framework, no extra dependency.
- **250 templates**: pick a layout, theme and accent, then edit copy, packages and badges.
- **Update without redeploying**: change prices, copy or layout any time; the next placement resolve picks it up.
- **Localized**: 43 languages for the built-in strings, plus per-locale copy of your own.

Learn more in [Show paywalls](https://www.revnix.io/docs/capacitor/show-paywalls) and [Placements](https://www.revnix.io/docs/placements).

## A/B tests with a built-in holdout

![Revnix A/B test results with a winner and credible intervals](https://www.revnix.io/sdk/react-native/ab-test.png)

- Split a placement's traffic between offering and paywall variants. Conversions, trials, revenue per user and MRR are calculated per variant.
- Add a **holdout** variant that shows no paywall at all, to measure what the paywall is really worth.
- Bayesian results with 95% credible intervals and a sample-size planner, so you know when to stop.
- Ship the winner from the dashboard; the plugin needs no change.

Learn more in [A/B tests](https://www.revnix.io/docs/ab-tests).

## Attribution and deep links

![Revnix MRR by country, last 90 days](https://www.revnix.io/sdk/react-native/attribution.png)

- **Install attribution** from Revnix links, with per-link click lookback windows. See [Attribution](https://www.revnix.io/docs/attribution).
- **Deferred deep links** resolve on first launch, so a user who installs from a campaign lands on the right screen. See [Deferred deep links](https://www.revnix.io/docs/deferred-deep-links).
- **Apple Search Ads** and **Google Ads** attribution, with App Tracking Transparency support. See [Apple Search Ads](https://www.revnix.io/docs/apple-search-ads) and [Google Ads](https://www.revnix.io/docs/google-ads-attribution).
- **MMP forwarding** to AppsFlyer and Adjust, **ad revenue** logging and **uninstall measurement**. See [MMP attribution](https://www.revnix.io/docs/mmp-attribution), [Ad revenue](https://www.revnix.io/docs/ad-revenue) and [Uninstall measurement](https://www.revnix.io/docs/uninstall-measurement).
- **Fraud prevention**: anonymous-IP and click-injection checks keep paid channels honest. See [Fraud prevention](https://www.revnix.io/docs/fraud-prevention).

## Real-time analytics for your Capacitor app

![Revnix overview: active subscriptions, revenue and MRR over 90 days](https://www.revnix.io/sdk/react-native/analytics.png)

- Revenue, MRR, ARR, ARPU, LTV and ROAS, updated from the ledger as purchases arrive.
- Cohorts, retention, funnels and predicted LTV. See [Analytics](https://www.revnix.io/docs/analytics).
- Filter and group by store, product, country, channel, campaign and A/B test variant.
- Saved reports, alerts and a REST API for your own dashboards. See [Reports](https://www.revnix.io/docs/reports) and [REST API](https://www.revnix.io/docs/rest-api).

## Platform Support

| Platform | Support |
| --- | --- |
| iOS 16.0 and later | StoreKit 2 purchases, entitlements, paywalls, attribution |
| Android 7.0 (API 24) and later | Google Play Billing 8 purchases, entitlements, paywalls, attribution |
| Web | Entitlements, placements and the paywall renderer. `purchase()` and `restore()` are mobile only; register web purchases from your server |

| Capacitor version | `revnix-capacitor` version |
| --- | --- |
| 8.x | 1.x |
| 7.x and older | Not supported |

Building the Android side needs JDK 21. Ships CommonJS and ESM builds with full TypeScript types.

## Documentation

- [Overview](https://www.revnix.io/docs/capacitor)
- [Installation](https://www.revnix.io/docs/capacitor/installation)
- [Configuration](https://www.revnix.io/docs/capacitor/configuration)
- [Make purchases](https://www.revnix.io/docs/capacitor/make-purchases)
- [Check entitlements](https://www.revnix.io/docs/capacitor/check-entitlements)
- [Show paywalls](https://www.revnix.io/docs/capacitor/show-paywalls)
- [API reference](https://www.revnix.io/docs/capacitor/reference)

Revnix also ships SDKs for [React Native](https://www.revnix.io/docs/react-native), [iOS](https://www.revnix.io/docs/ios), [Android](https://www.revnix.io/docs/android), [Flutter](https://www.revnix.io/docs/flutter) and [Unity](https://www.revnix.io/docs/unity).

## Migrating from another SDK

Moving from Adapty or RevenueCat? Revnix imports your customers and purchase history, and the SDK calls map one to one.

- [Migrate from Adapty](https://www.revnix.io/docs/migrate-from-adapty)
- [Migrate from RevenueCat](https://www.revnix.io/docs/migrate-from-revenuecat)

## Support

- Email [support@revnix.io](mailto:support@revnix.io) with questions, bugs or feature requests.
- Check the [status page](https://www.revnix.io/status) for incidents.
- Want to work on the plugin itself? See [CONTRIBUTING.md](https://github.com/Oth-tech/RevnixSDK-Capacitor/blob/main/CONTRIBUTING.md).

## License

Revnix SDK is available under the MIT license. See [LICENSE](https://github.com/Oth-tech/RevnixSDK-Capacitor/blob/main/LICENSE) for details.
