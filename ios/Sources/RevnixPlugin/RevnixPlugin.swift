import Capacitor
import Foundation
import StoreKit

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
        CAPPluginMethod(name: "identify", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCachedEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isEntitled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "waitForEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "retryPendingPurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingPurchaseCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolvePlacement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerInstall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logPaywallShown", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logPaywallClosed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logPaywallEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logAdRevenue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "track", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flushEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAttribution", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPushToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestTrackingAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAttributes", returnType: CAPPluginReturnPromise),
        // REV-272: the one implicit moment no SDK can see for itself.
        CAPPluginMethod(name: "handleDeepLink", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveDeepLink", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLastDeepLink", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "handleInstallReferrer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateSkanConversionValue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAttribution", returnType: CAPPluginReturnPromise),
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
            },
            // REV-268: revnix-swift detects the device facts; JS may override
            // the ones the app knows better.
            device: Self.deviceFacts(overrides: call.getObject("device")),
            // REV-272: JS opts in explicitly — the plugin always has a handler
            // to give (the event emitter), so "is there a handler" cannot be
            // the signal the way it is in react-native-revnix.
            onImplicitPaywall: { [weak self] trigger in
                // retainUntilConsumed: the launch moments fire during
                // configure(), which a JS app typically calls BEFORE
                // addListener resolves. Dropping those would lose the paywall
                // after the ledger row was already written — the one failure
                // here that looks like the server misbehaving.
                self?.notifyListeners(
                    "implicitPaywall",
                    data: [
                        "placement": trigger.placement.rawValue,
                        "resolution": Self.js(trigger.resolution),
                    ],
                    retainUntilConsumed: true)
            },
            implicitPlacements: call.getBool("implicitPlacements") ?? false,
            // REV-299: retainUntilConsumed for the same reason as
            // implicitPaywall above — this fires during configure(), which a
            // JS app typically calls BEFORE addListener resolves.
            onDeferredDeepLink: { [weak self] url, match in
                self?.notifyListeners(
                    "deferredDeepLink",
                    data: ["url": url.absoluteString, "match": match.rawValue],
                    retainUntilConsumed: true)
            },
            onAttribution: { [weak self] attribution in
                self?.notifyListeners(
                    "attribution",
                    data: Self.js(attribution),
                    retainUntilConsumed: true)
            },
            sessionTimeout: (call.getDouble("sessionTimeoutMs")
                ?? revnixDefaultSessionTimeout * 1000) / 1000.0,
            skan: call.getBool("skan") ?? true,
            attWaitTimeout: call.getDouble("attWaitTimeoutMs").map { $0 / 1000 },
            deviceIntegrity: call.getBool("deviceIntegrity") ?? false
        )
        configOverride?(&config)
        let created = RevnixClient(config)
        // REV-272: retire the previous client BEFORE replacing it. Its
        // didBecomeActive observer lives on NotificationCenter and outlives the
        // reference, so a re-configure without this leaves two clients watching
        // the foreground — every return would then mint two session_start
        // triggers and emit two implicitPaywall events. Same reasoning as the
        // StoreKit observer retired just below, different resource.
        if let previous = client {
            Task { await previous.stop() }
        }
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

    /// Detected facts with the JS-supplied overrides applied (REV-268).
    private static func deviceFacts(overrides: [String: Any]?) -> DeviceFacts {
        var facts = DeviceFacts.detect()
        guard let overrides else { return facts }
        if let v = overrides["platform"] as? String { facts.platform = v }
        if let v = overrides["osVersion"] as? String { facts.osVersion = v }
        if let v = overrides["appVersion"] as? String { facts.appVersion = v }
        if let v = overrides["locale"] as? String { facts.locale = v }
        if let v = overrides["currency"] as? String { facts.currency = v }
        if let v = overrides["storefront"] as? String { facts.storefront = v }
        if let v = overrides["model"] as? String { facts.model = v }
        if let v = overrides["sandbox"] as? Bool { facts.sandbox = v }
        return facts
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

    @objc func identify(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let userId = call.getString("userId") else {
            call.reject("userId is required", "invalid")
            return
        }
        Task { call.resolve(["customerId": await client.identify(userId)]) }
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

    @objc func purchase(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let productId = call.getString("productId") else {
            call.reject("productId is required", "invalid", nil, ["isRetryable": false])
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject(
                        "No store product \"\(productId)\"", "product_not_found", nil,
                        ["isRetryable": false])
                    return
                }
                let result = try await RevnixStoreKit.purchase(product, client: client)
                call.resolve(["result": result.map(Self.js) ?? NSNull()])
            } catch StoreKitError.networkError(let underlying) {
                call.reject("\(underlying)", "store_error", underlying, ["isRetryable": true])
            } catch let err where err is StoreKitError || err is Product.PurchaseError {
                call.reject("\(err)", "store_error", err, ["isRetryable": false])
            } catch {
                Self.reject(call, error)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task {
            try? await AppStore.sync()
            call.resolve(["restored": await RevnixStoreKit.restore(client: client)])
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

    /// REV-272: the URL that opened the app. Capacitor delivers it to the
    /// host's own `appUrlOpen` listener, so the host forwards it here.
    @objc func handleDeepLink(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            call.reject("url is required", "invalid", nil, ["isRetryable": false])
            return
        }
        // Resolved immediately: this runs inside the host's appUrlOpen handler,
        // right before it routes, and the trigger is two network round trips.
        // Every Revnix telemetry call is a beacon, and this is one too.
        Task { await client.handleDeepLink(url) }
        call.resolve()
    }

    /// REV-299: unwrap a link an email service provider wrapped in its own
    /// click-tracking domain.
    @objc func resolveDeepLink(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            call.reject("url is required", "invalid", nil, ["isRetryable": false])
            return
        }
        Task {
            let resolved = await client.resolveDeepLink(url)
            call.resolve(["url": resolved.absoluteString])
        }
    }

    @objc func getLastDeepLink(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task {
            if let lastDeepLink = await client.lastDeepLink() {
                call.resolve([
                    "lastDeepLink": [
                        "url": lastDeepLink.url.absoluteString,
                        "receivedAt": Int(lastDeepLink.receivedAt.timeIntervalSince1970 * 1000),
                    ],
                ])
            } else {
                call.resolve(["lastDeepLink": NSNull()])
            }
        }
    }

    @objc func handleInstallReferrer(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func getAttribution(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task {
            if let attribution = await client.getAttribution() {
                call.resolve(["attribution": Self.js(attribution)])
            } else {
                call.resolve(["attribution": NSNull()])
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

    @objc func updateSkanConversionValue(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let value = call.getInt("value") else {
            call.reject("value is required", "invalid", nil, ["isRetryable": false])
            return
        }
        let coarse = call.getString("coarse").flatMap(RevnixCoarseValue.init(rawValue:))
        let lockWindow = call.getBool("lockWindow") ?? false
        Task {
            await client.updateSkanConversionValue(value, coarse: coarse, lockWindow: lockWindow)
            call.resolve()
        }
    }

    @objc func logPaywallShown(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        let placementKey = call.getString("placementKey")
        let paywallId = call.getString("paywallId")
        let productsShown = (call.getArray("productsShown") as? [[String: Any]])?.compactMap {
            entry -> RevnixPaywallProductShown? in
            guard let productId = entry["productId"] as? String, !productId.isEmpty else { return nil }
            return RevnixPaywallProductShown(
                productId: productId,
                priceLabel: entry["priceLabel"] as? String,
                amountMinor: (entry["amountMinor"] as? NSNumber)?.intValue,
                currency: entry["currency"] as? String)
        }
        Task {
            // REV-252: resolves with the view id so the JS side can pair this
            // display's close with it. An older JS caller ignores the field.
            let viewId = await client.logPaywallDisplay(
                placementKey: placementKey, paywallId: paywallId, decisionId: nil,
                priceShown: nil, screenIndex: nil, blockId: nil, durationMs: nil,
                productsShown: productsShown)
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

    @objc func logAdRevenue(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let revenue = call.getDouble("revenue"), revenue > 0 else {
            call.reject("revenue must be a number > 0", "invalid")
            return
        }
        guard let currency = call.getString("currency") else {
            call.reject("currency is required", "invalid")
            return
        }
        let network = call.getString("network")
        let mediation = call.getString("mediation")
        let adUnit = call.getString("adUnit")
        let placement = call.getString("placement")
        let format = call.getString("format")
        let eventId = call.getString("eventId")
        Task {
            await client.logAdRevenue(
                revenue: revenue,
                currency: currency,
                network: network,
                mediation: mediation,
                adUnit: adUnit,
                placement: placement,
                format: format,
                eventId: eventId)
            call.resolve()
        }
    }

    @objc func track(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let event = call.getString("event") else {
            call.reject("event is required", "invalid")
            return
        }
        let raw = call.getObject("properties")
        let properties: [String: JSONValue]? = raw?.compactMapValues { value in
            if let text = value as? String {
                return .string(text)
            } else if let number = value as? NSNumber {
                if CFGetTypeID(number as CFTypeRef) == CFBooleanGetTypeID() {
                    return .bool(number.boolValue)
                }
                return .number(number.doubleValue)
            }
            return nil
        }
        let eventId = call.getString("eventId")
        Task {
            await client.track(event, properties: properties, eventId: eventId)
            call.resolve()
        }
    }

    @objc func flushEvents(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task {
            await client.flushEvents()
            call.resolve()
        }
    }

    @objc func preload(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let keys = call.getArray("placementKeys", String.self) else {
            call.reject("placementKeys is required", "invalid")
            return
        }
        Task {
            await client.preload(keys)
            call.resolve()
        }
    }

    @objc func setAttribution(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let provider = call.getString("provider") else {
            call.reject("provider is required", "invalid")
            return
        }
        guard let network = call.getString("network") else {
            call.reject("network is required", "invalid")
            return
        }
        let campaign = call.getString("campaign")
        let adGroup = call.getString("adGroup")
        let creative = call.getString("creative")
        Task {
            await client.setAttribution(
                provider: provider,
                network: network,
                campaign: campaign,
                adGroup: adGroup,
                creative: creative)
            call.resolve()
        }
    }

    @objc func setPushToken(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        guard let token = call.getString("token") else {
            call.reject("token is required", "invalid")
            return
        }
        Task {
            await client.setPushToken(token)
            call.resolve()
        }
    }

    @objc func requestTrackingAuthorization(_ call: CAPPluginCall) {
        guard let client = requireClient(call) else { return }
        Task { call.resolve(["status": await client.requestTrackingAuthorization()]) }
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

    private static func js(_ attribution: RevnixAttribution) -> [String: Any] {
        var out: [String: Any] = [
            "installMatch": attribution.installMatch,
            "attributedAt": attribution.attributedAt,
        ]
        if let v = attribution.reattributedAt { out["reattributedAt"] = v }
        if let v = attribution.linkToken { out["linkToken"] = v }
        if let v = attribution.referrerSource { out["referrerSource"] = v }
        if let v = attribution.matchSignals { out["matchSignals"] = v }
        if let v = attribution.source { out["source"] = v }
        if let v = attribution.medium { out["medium"] = v }
        if let v = attribution.campaign { out["campaign"] = v }
        if let v = attribution.term { out["term"] = v }
        if let v = attribution.content { out["content"] = v }
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
