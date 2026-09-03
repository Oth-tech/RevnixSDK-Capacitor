import Capacitor
import Foundation

// revnix-swift comes from the git submodule at ios/Revnix. Under Swift Package
// Manager it is its own module (imported here); under CocoaPods the podspec
// compiles the same sources into this module, so there is nothing to import.
#if canImport(Revnix)
    import Revnix
#endif

/// iOS side of the Capacitor bridge — a thin adapter over `revnix-swift`.
///
/// Deliberately holds no policy of its own: the offline cache, retry queue,
/// and kill-switch discipline all live in `RevnixClient`. This file's only
/// jobs are marshalling and, critically, preserving the error taxonomy across
/// the bridge so a 401 does not arrive in JS as a generic failure.
@objc(RevnixPlugin)
public class RevnixPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RevnixPlugin"
    public let jsName = "Revnix"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCustomerId", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCachedEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isEntitled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "waitForEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "retryPendingPurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingPurchaseCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolvePlacement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerInstall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logPaywallShown", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logPaywallClosed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logPaywallEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAttributes", returnType: CAPPluginReturnPromise),
    ]

    private var client: RevnixClient?
    /// The StoreKit 2 observer (`Transaction.updates`), started by
    /// `configure`. Transactions that complete outside a JS-initiated
    /// purchase — renewals, Ask to Buy approvals, refunds, another device —
    /// never pass through JS, so the observer lives here (the Flutter plugin
    /// does the same; Android's PlayBillingConnector plays this role). A
    /// re-configure retires the previous observer, and `deinit` the last
    /// one. Exposed for tests; read-only outside.
    private(set) var observer: Task<Void, Never>?

    // Test seams: let the suite keep `configure` off the disk and the
    // network, and see which client the observer was bound to. Production
    // never assigns them.
    var configOverride: ((inout RevnixConfig) -> Void)?
    var startObserver: (RevnixClient) -> Task<Void, Never> = {
        RevnixStoreKit.startObserving(client: $0)
    }

    deinit {
        observer?.cancel()
    }

    // MARK: - Lifecycle

    @objc func configure(_ call: CAPPluginCall) {
        guard
            let apiKey = call.getString("apiKey"),
            let baseUrl = call.getString("baseUrl"),
            let url = URL(string: baseUrl)
        else {
            call.reject("apiKey and baseUrl are required", "invalid", nil, ["isRetryable": false])
            return
        }
        var config = RevnixConfig(
            apiKey: apiKey,
            baseURL: url,
            timeout: (call.getDouble("timeoutMs") ?? 10_000) / 1000.0,
            offlineMaxCacheAge: (call.getDouble("offlineMaxCacheAgeMs")
                ?? 14 * 24 * 3600 * 1000) / 1000.0,
            entitlementsTTL: (call.getDouble("entitlementsTtlMs") ?? 30_000) / 1000.0,
            onDiagnostic: { [weak self] diagnostic in
                self?.notifyListeners(
                    "diagnostic",
                    data: ["op": diagnostic.op, "message": diagnostic.message])
            }
        )
        configOverride?(&config)
        let created = RevnixClient(config)
        client = created
        observer?.cancel()
        observer = startObserver(created)
        // Launch chores, same family contract as every Revnix SDK: drain the
        // retry queue, report the install. Idempotent; never blocks configure.
        Task {
            _ = await created.retryPendingPurchases()
            await created.registerInstall(
                platform: "ios-capacitor",
                appVersion: Bundle.main.object(
                    forInfoDictionaryKey: "CFBundleShortVersionString") as? String)
        }
        call.resolve()
    }

    private func requireClient(_ call: CAPPluginCall) -> RevnixClient? {
        guard let client else {
            call.reject(
                "Revnix.configure() must be called first", "invalid", nil,
                ["isRetryable": false])
            return nil
        }
        return client
    }

    // MARK: - Identity

    @objc func getCustomerId(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task { call.resolve(["customerId": await client.customerId()]) }
    }

    @objc func logout(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task { call.resolve(["customerId": await client.logout()]) }
    }

    // MARK: - Entitlements

    @objc func getEntitlements(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task {
            do {
                call.resolve(Self.js(try await client.entitlements()))
            } catch {
                Self.reject(call, error)
            }
        }
    }

    @objc func getCachedEntitlements(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task {
            if let snapshot = await client.cachedEntitlements() {
                call.resolve(["snapshot": Self.js(snapshot)])
            } else {
                call.resolve(["snapshot": NSNull()])
            }
        }
    }

    @objc func isEntitled(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        let entitlementId = call.getString("entitlementId") ?? ""
        Task {
            call.resolve(["entitled": await client.isEntitled(entitlementId)])
        }
    }

    @objc func waitForEntitlements(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        let seq = call.getInt("seq") ?? 0
        Task {
            do {
                call.resolve(Self.js(try await client.waitForEntitlements(seq: seq)))
            } catch {
                Self.reject(call, error)
            }
        }
    }

    // MARK: - Purchases

    @objc func registerPurchase(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard
            let token = call.getString("token"),
            let productId = call.getString("productId"),
            let transactionId = call.getString("transactionId")
        else {
            call.reject(
                "token, productId and transactionId are required", "invalid", nil,
                ["isRetryable": false])
            return
        }
        let input = RegisterPurchaseInput(
            source: RevnixStore(rawValue: call.getString("source") ?? "apple") ?? .apple,
            token: token,
            productId: productId,
            transactionId: transactionId,
            occurredAt: call.getInt("occurredAt"),
            expiresAt: call.getInt("expiresAt"),
            signedTransactionInfo: call.getString("signedTransactionInfo"))
        Task {
            do {
                call.resolve(Self.js(try await client.registerPurchase(input)))
            } catch {
                Self.reject(call, error)
            }
        }
    }

    @objc func retryPendingPurchases(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task {
            call.resolve(["delivered": await client.retryPendingPurchases()])
        }
    }

    @objc func pendingPurchaseCount(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task { call.resolve(["count": await client.pendingPurchaseCount()]) }
    }

    // MARK: - Placements & telemetry

    @objc func resolvePlacement(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        let key = call.getString("placementKey") ?? ""
        Task {
            do {
                call.resolve(Self.js(try await client.resolvePlacement(key)))
            } catch {
                Self.reject(call, error)
            }
        }
    }

    @objc func registerInstall(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        let platform = call.getString("platform")
        let appVersion = call.getString("appVersion")
        Task {
            await client.registerInstall(platform: platform, appVersion: appVersion)
            call.resolve()
        }
    }

    @objc func logPaywallShown(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        let placementKey = call.getString("placementKey")
        let paywallId = call.getString("paywallId")
        Task {
            // REV-252: resolves with the view id so the JS side can pair this
            // display's close with it. An older JS caller ignores the field.
            let viewId = await client.logPaywallDisplay(
                placementKey: placementKey, paywallId: paywallId)
            call.resolve(viewId.map { ["viewId": $0] } ?? [:])
        }
    }

    @objc func logPaywallClosed(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let viewId = call.getString("viewId") else {
            call.reject("viewId is required", "invalid")
            return
        }
        let placementKey = call.getString("placementKey")
        let paywallId = call.getString("paywallId")
        Task {
            await client.logPaywallClosed(
                viewId: viewId, placementKey: placementKey, paywallId: paywallId)
            call.resolve()
        }
    }

    @objc func logPaywallEvent(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let viewId = call.getString("viewId") else {
            call.reject("viewId is required", "invalid")
            return
        }
        // REV-263: the wire name maps 1:1 onto the enum's rawValue. Rejected
        // rather than silently dropped — an unknown name is a caller bug, and
        // the same string would have been a 400 at the API.
        guard let raw = call.getString("event"),
            let event = RevnixPaywallEvent(rawValue: raw)
        else {
            call.reject("event must be one of the six paywall interactions", "invalid")
            return
        }
        let placementKey = call.getString("placementKey")
        let paywallId = call.getString("paywallId")
        let productId = call.getString("productId")
        let code = call.getString("code")
        let message = call.getString("message")
        let eventId = call.getString("eventId")
        Task {
            await client.logPaywallEvent(
                event,
                viewId: viewId,
                placementKey: placementKey,
                paywallId: paywallId,
                productId: productId,
                code: code,
                message: message,
                eventId: eventId)
            call.resolve()
        }
    }

    @objc func setAttributes(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let raw = call.getObject("attributes") else {
            call.reject("attributes object is required", "invalid")
            return
        }
        // Values cross the WebView bridge as NSString/NSNumber/NSNull;
        // anything else is a caller bug the server would 400 anyway.
        var attributes: [String: JSONValue] = [:]
        for (key, value) in raw {
            if value is NSNull {
                attributes[key] = .null
            } else if let text = value as? String {
                attributes[key] = .string(text)
            } else if let number = value as? NSNumber {
                attributes[key] = .number(number.doubleValue)
            }
        }
        Task {
            do {
                try await client.setAttributes(attributes)
                call.resolve()
            } catch {
                Self.reject(call, error)
            }
        }
    }

    // MARK: - Marshalling

    private static func js(_ snapshot: CustomerEntitlements) -> [String: Any] {
        var out: [String: Any] = [
            "customerId": snapshot.customerId,
            "cursor": snapshot.cursor,
            "entitlements": snapshot.entitlements.map { ent -> [String: Any] in
                var e: [String: Any] = [
                    "entitlementId": ent.entitlementId,
                    "isActive": ent.isActive,
                    "sources": ent.sources.map { src -> [String: Any] in
                        var s: [String: Any] = [
                            "kind": src.kind,
                            "key": src.key,
                            "isActive": src.isActive,
                        ]
                        if let expiresAt = src.expiresAt { s["expiresAt"] = expiresAt }
                        return s
                    },
                ]
                if let expiresAt = ent.expiresAt { e["expiresAt"] = expiresAt }
                return e
            },
        ]
        if let stale = snapshot.stale { out["stale"] = stale }
        if let fetchedAt = snapshot.fetchedAt { out["fetchedAt"] = fetchedAt }
        return out
    }

    private static func js(_ result: RegisterPurchaseResult) -> [String: Any] {
        var out: [String: Any] = [
            "eventId": result.eventId,
            "seq": result.seq,
            "duplicate": result.duplicate,
            "customerId": result.customerId,
            "transferred": result.transferred,
        ]
        if let v = result.ownedByOtherCustomer { out["ownedByOtherCustomer"] = v }
        if let v = result.refused { out["refused"] = v }
        if let v = result.restored { out["restored"] = v }
        if let v = result.provisional { out["provisional"] = v }
        return out
    }

    private static func js(_ resolution: PlacementResolution) -> [String: Any] {
        var offering: [String: Any] = [
            "offeringId": resolution.offering.offeringId,
            "displayName": resolution.offering.displayName,
            "packages": resolution.offering.packages.map { pkg -> [String: Any] in
                ["packageId": pkg.packageId, "productId": pkg.productId]
            },
        ]
        if let metadata = resolution.offering.metadata {
            offering["metadata"] = any(metadata)
        }
        var out: [String: Any] = [
            "status": resolution.status,
            "placementKey": resolution.placementKey,
            "revision": resolution.revision,
            "offering": offering,
        ]
        // The raw copies, not the typed `paywall` / `experiment`: JS owns the
        // parse, and the typed paywall is decoded through the native block
        // model, which drops what it does not know.
        if let paywall = resolution.paywallJSON { out["paywall"] = any(paywall) }
        // REV-219: always present, per the TS contract — a null/absent wire
        // value both surface as JS null.
        out["experiment"] = resolution.experimentJSON.map(any) ?? NSNull()
        return out
    }

    private static func any(_ value: JSONValue) -> Any {
        switch value {
        case .string(let s): return s
        case .number(let n): return n
        case .bool(let b): return b
        case .null: return NSNull()
        case .array(let a): return a.map(any)
        case .object(let o): return o.mapValues(any)
        }
    }

    /// The bridge's real contract: a stable code plus `isRetryable`, so JS can
    /// rebuild the typed error. Lose this and a kill switch becomes
    /// indistinguishable from an outage.
    private static func reject(_ call: CAPPluginCall, _ error: Error) {
        guard let err = error as? RevnixError else {
            call.reject("\(error)", "network", error, ["isRetryable": true])
            return
        }
        var data: [String: Any] = ["isRetryable": err.isRetryable]
        let code: String
        switch err {
        case .network: code = "network"
        case .timeout: code = "timeout"
        case .rateLimited(let retryAfterMs):
            code = "rate_limited"
            data["status"] = 429
            if let retryAfterMs { data["retryAfterMs"] = retryAfterMs }
        case .server(let status):
            code = "server"
            data["status"] = status
        case .badResponse: code = "bad_response"
        case .auth(let status):
            code = "auth"
            data["status"] = status
        case .notFound:
            code = "not_found"
            data["status"] = 404
        case .purchaseBlocked:
            code = "purchase_blocked"
            data["status"] = 409
        case .invalid(let status, _):
            code = "invalid"
            data["status"] = status
        }
        call.reject("\(err)", code, err, data)
    }
}
