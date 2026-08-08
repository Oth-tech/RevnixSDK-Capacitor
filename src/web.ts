import { WebPlugin } from '@capacitor/core';
import { RevnixClient } from 'revnix-react';

import type {
  ConfigureOptions,
  CustomerEntitlements,
  PlacementResolution,
  RegisterPurchaseInput,
  RegisterPurchaseResult,
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

  private require(): RevnixClient {
    if (!this.client) {
      throw new Error('Revnix.configure() must be called first');
    }
    return this.client;
  }

  async configure(options: ConfigureOptions): Promise<void> {
    this.client?.dispose();
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

  async resolvePlacement(options: { placementKey: string }): Promise<PlacementResolution> {
    // Wire-identical shapes (this plugin's PlacementPaywall/PaywallConfig
    // mirror revnix-react's); revnix-react uses null where this plugin's
    // definitions use undefined, matching the native bridges which omit the
    // key entirely.
    const resolution = await this.require().resolvePlacement(options.placementKey);
    return {
      ...resolution,
      paywall: (resolution.paywall ?? undefined) as PlacementResolution['paywall'],
    } as PlacementResolution;
  }

  async registerInstall(): Promise<void> {
    // Handled by configure() via revnix-react's reportInstalls.
  }

  async logPaywallShown(options?: { placementKey?: string; paywallId?: string }): Promise<void> {
    this.require().logPaywallShown(options);
  }
}
