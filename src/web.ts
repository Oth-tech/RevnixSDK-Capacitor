import { WebPlugin } from '@capacitor/core';
import { RevnixClient } from 'revnix-react';

import type {
  ConfigureOptions,
  CustomerEntitlements,
  LastDeepLink,
  MmpProvider,
  PlacementResolution,
  RegisterPurchaseInput,
  RegisterPurchaseResult,
  RevnixAttribution,
  RevnixPaywallEvent,
  RevnixPlugin,
} from './definitions';

/**
 * Web implementation — delegates to `revnix-react`, the CANONICAL TypeScript
 * implementation of the Revnix resilience policy (its `resilience.test.ts`
 * is the behavioral spec every port follows). Nothing is reimplemented here;
 * a Capacitor app running as a plain website gets exactly the client a React
 * web app gets. Store purchases have no web flow — `registerPurchase` still
 * works for tokens obtained elsewhere, and the native iOS/Android sides own
 * the real store glue.
 */
export class RevnixWeb extends WebPlugin implements RevnixPlugin {
  private client: RevnixClient | null = null;
  /** Kept for the setAttributes shim below — see the note there. */
  private credentials: { apiKey: string; baseUrl: string } | null = null;

  private require(): RevnixClient {
    if (!this.client) {
      throw new Error('Revnix.configure() must be called first');
    }
    return this.client;
  }

  async configure(options: ConfigureOptions): Promise<void> {
    this.client?.dispose();
    this.credentials = { apiKey: options.apiKey, baseUrl: options.baseUrl };
    this.client = new RevnixClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      // localStorage survives relaunch in the webview and on the web —
      // same durability class as the native FileStorage implementations.
      storage: {
        getItem: (key: string) => window.localStorage.getItem(key),
        setItem: (key: string, value: string) => {
          window.localStorage.setItem(key, value);
        },
      },
      reportInstalls: true,
      installMetadata: { platform: 'web' },
      // REV-268: revnix-react detects what a browser exposes (platform, OS
      // version, locale); the app's overrides win.
      device: options.device,
      // REV-272: implicit placements. revnix-react turns them on when a
      // handler is present, so the web build gates on the OPTION instead —
      // this plugin always has a handler to give (the event emitter), and
      // without the option every Capacitor web app would start firing.
      implicitPlacements: options.implicitPlacements ?? false,
      ...(options.sessionTimeoutMs !== undefined
        ? { sessionTimeoutMs: options.sessionTimeoutMs }
        : {}),
      onImplicitPaywall: (trigger) => {
        // retainUntilConsumed: the launch moments fire during configure(),
        // which an app typically calls BEFORE addListener resolves. Dropping
        // those would lose the paywall after the ledger row was already
        // written — the one failure here that looks like a server bug.
        this.notifyListeners(
          'implicitPaywall',
          {
            placement: trigger.placement,
            resolution: trigger.resolution,
          },
          true,
        );
      },
    });
    // Launch chore, same as the native sides: drain anything a previous
    // session failed to deliver. Idempotent server-side.
    void this.client.retryPendingPurchases().catch(() => {
      this.notifyListeners('diagnostic', {
        op: 'retryPendingPurchases',
        message: 'launch drain failed; will retry next launch',
      });
    });
  }

  async getCustomerId(): Promise<{ customerId: string }> {
    return { customerId: await this.require().getCustomerId() };
  }

  async logout(): Promise<{ customerId: string }> {
    return { customerId: await this.require().logout() };
  }

  async getEntitlements(): Promise<CustomerEntitlements> {
    return (await this.require().getEntitlements()) as CustomerEntitlements;
  }

  async getCachedEntitlements(): Promise<{ snapshot: CustomerEntitlements | null }> {
    const snapshot = await this.require().getCachedEntitlements();
    return { snapshot: (snapshot as CustomerEntitlements) ?? null };
  }

  async isEntitled(options: { entitlementId: string }): Promise<{ entitled: boolean }> {
    return { entitled: await this.require().isEntitled(options.entitlementId) };
  }

  async waitForEntitlements(options: { seq: number }): Promise<CustomerEntitlements> {
    return (await this.require().waitForEntitlements(options.seq)) as CustomerEntitlements;
  }

  async registerPurchase(options: RegisterPurchaseInput): Promise<RegisterPurchaseResult> {
    return (await this.require().registerPurchase(options)) as RegisterPurchaseResult;
  }

  async retryPendingPurchases(): Promise<{ delivered: number }> {
    // revnix-react drains internally without reporting a count.
    await this.require().retryPendingPurchases();
    return { delivered: 0 };
  }

  async pendingPurchaseCount(): Promise<{ count: number }> {
    // The queue is internal to revnix-react on web; no inspection API yet.
    return { count: 0 };
  }

  async handleDeepLink(options: { url: string }): Promise<void> {
    // REV-272: `visibilitychange` covers foreground, but nothing tells the SDK
    // a link opened the app — Capacitor delivers that to the host's own
    // appUrlOpen listener.
    this.require().handleDeepLink(options.url);
  }

  // ponytail: revnix-react 1.1.2 lacks resolveDeepLink; switch to this.require().resolveDeepLink() once it ships.
  async resolveDeepLink(options: { url: string }): Promise<{ url: string }> {
    const credentials = this.credentials;
    if (!credentials) throw new Error('Revnix.configure() must be called first');
    const { url } = options;
    if (!url) return { url };
    if (url.length > 1024 || !/^https?:\/\//i.test(url)) return { url };
    try {
      const res = await fetch(
        `${credentials.baseUrl.replace(/\/$/, '')}/v1/links/resolve?url=${encodeURIComponent(url)}`,
        { headers: { Authorization: `Bearer ${credentials.apiKey}` } },
      );
      if (!res.ok) return { url };
      const body = await res.json();
      return typeof body?.url === 'string' && body.url ? { url: body.url } : { url };
    } catch {
      return { url };
    }
  }

  // ponytail: revnix-react 1.1.2 lacks getLastDeepLink; switch to this.require().getLastDeepLink() once it ships.
  async getLastDeepLink(): Promise<{ lastDeepLink: LastDeepLink | null }> {
    return { lastDeepLink: null };
  }

  async getAttribution(): Promise<{ attribution: RevnixAttribution | null }> {
    return { attribution: null };
  }

  async handleInstallReferrer(): Promise<void> {}

  async resolvePlacement(options: { placementKey: string }): Promise<PlacementResolution> {
    // Wire-identical shapes (this plugin's PlacementPaywall/PaywallConfig
    // mirror revnix-react's); revnix-react uses null where this plugin's
    // definitions use undefined, matching the native bridges which omit the
    // key entirely. `experiment` passes through untouched, normalized to
    // null when an older server omits the key (REV-219).
    const resolution = await this.require().resolvePlacement(options.placementKey);
    return {
      ...resolution,
      paywall: (resolution.paywall ?? undefined) as PlacementResolution['paywall'],
      experiment: (resolution.experiment ?? null) as PlacementResolution['experiment'],
    } as PlacementResolution;
  }

  async registerInstall(): Promise<void> {
    // Handled by configure() via revnix-react's reportInstalls.
  }

  async updateSkanConversionValue(): Promise<void> {
    // SKAdNetwork does not exist on the web.
  }

  async logPaywallShown(options?: {
    placementKey?: string;
    paywallId?: string;
  }): Promise<{ viewId?: string }> {
    return { viewId: this.require().logPaywallShown(options) };
  }

  async logPaywallClosed(options: {
    viewId: string;
    placementKey?: string;
    paywallId?: string;
  }): Promise<void> {
    this.require().logPaywallClosed(options.viewId, {
      placementKey: options.placementKey,
      paywallId: options.paywallId,
    });
  }

  async logPaywallEvent(options: {
    event: RevnixPaywallEvent;
    viewId: string;
    placementKey?: string;
    paywallId?: string;
    productId?: string;
    code?: string;
    message?: string;
    eventId?: string;
  }): Promise<void> {
    const { event, viewId, ...rest } = options;
    this.require().logPaywallEvent(event, viewId, rest);
  }

  async logAdRevenue(options: {
    revenue: number;
    currency: string;
    network?: string;
    mediation?: string;
    adUnit?: string;
    placement?: string;
    format?: string;
    eventId?: string;
  }): Promise<void> {
    this.require().logAdRevenue(options);
  }

  async setAttribution(options: {
    provider: MmpProvider;
    network: string;
    campaign?: string;
    adGroup?: string;
    creative?: string;
  }): Promise<void> {
    this.require().setAttribution(options);
  }

  async setPushToken(options: { token: string }): Promise<void> {
    this.require().setPushToken(options.token);
  }

  async setAttributes(options: {
    attributes: Record<string, string | number | null>;
  }): Promise<void> {
    await this.require().setAttributes(options.attributes);
  }
}
