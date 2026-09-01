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
      // REV-219: identify the caller on placement reads so the server can pin
      // a sticky experiment variant. revnix-react 0.12.0 does not send the
      // parameter itself; append it here (guarded, so a future revnix-react
      // that does is not double-appended). Older servers simply ignore it.
      fetch: async (input, init) => {
        if (this.client && (typeof input === 'string' || input instanceof URL)) {
          const url = new URL(String(input));
          if (/\/v1\/placements\/[^/]+\/offering$/.test(url.pathname) && !url.searchParams.has('customer')) {
            url.searchParams.set('customer', await this.client.getCustomerId());
            return fetch(url.toString(), init);
          }
        }
        return fetch(input, init);
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

  async logPaywallShown(options?: {
    placementKey?: string;
    paywallId?: string;
  }): Promise<{ viewId?: string }> {
    // REV-252 version skew: this package pins revnix-react ^0.12.0, whose
    // logPaywallShown returns void. A newer one returns the view id. Read
    // whatever comes back rather than assuming — on the old dependency the
    // close is still reported, it just cannot be paired with its display.
    // Removable, like the setAttributes shim below, once the dependency is
    // bumped to a revnix-react that returns the id.
    const viewId = this.require().logPaywallShown(options) as unknown;
    return typeof viewId === 'string' ? { viewId } : {};
  }

  async logPaywallClosed(options: {
    viewId: string;
    placementKey?: string;
    paywallId?: string;
  }): Promise<void> {
    // Same skew: absent on revnix-react 0.12.0, so feature-detected rather
    // than called blind. A missing method costs the CLOSE EVENT, never the
    // dismissal — the paywall has already closed by the time this runs.
    const client = this.require() as unknown as {
      logPaywallClosed?: (
        viewId: string,
        options?: { placementKey?: string; paywallId?: string },
      ) => void;
    };
    client.logPaywallClosed?.(options.viewId, {
      placementKey: options.placementKey,
      paywallId: options.paywallId,
    });
  }

  // REV-033 v2: revnix-react 0.12.0 has no setAttributes, so this posts the
  // endpoint directly — the same version-skew shim this file already uses for
  // the ?customer= placement parameter, and removable the same way once the
  // dependency is bumped to a revnix-react that exposes the method.
  async setAttributes(options: {
    attributes: Record<string, string | number | null>;
  }): Promise<void> {
    const client = this.require();
    const credentials = this.credentials;
    if (!credentials) throw new Error('Revnix.configure() must be called first');
    const customerId = await client.getCustomerId();
    const res = await fetch(
      `${credentials.baseUrl.replace(/\/$/, '')}/v1/customers/${encodeURIComponent(
        customerId,
      )}/attributes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.apiKey}`,
        },
        body: JSON.stringify({ attributes: options.attributes }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`setAttributes failed (${res.status}): ${detail}`);
    }
  }
}
