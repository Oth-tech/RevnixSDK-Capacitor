package com.revnix.capacitor

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.revnix.CustomerEntitlements
import com.revnix.PlacementResolution
import com.revnix.RegisterPurchaseInput
import com.revnix.RegisterPurchaseResult
import com.revnix.RevnixClient
import com.revnix.RevnixConfig
import com.revnix.RevnixError
import com.revnix.RevnixStore
import com.revnix.android.AndroidStorage
import com.revnix.android.PlayBillingConnector
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import org.json.JSONObject

/**
 * Android side of the Capacitor bridge — a thin adapter over `revnix-kotlin`
 * (vendored under com.revnix until it ships to Maven Central).
 *
 * Holds no policy of its own. In particular the Play Billing acknowledgement
 * ordering (acknowledge only AFTER the claim is recorded or durably queued)
 * stays inside [PlayBillingConnector], where it is tested — pulling it up
 * into bridge code is how that rule gets broken.
 */
@CapacitorPlugin(name = "Revnix")
class RevnixPlugin : Plugin() {

    private var client: RevnixClient? = null
    private var billing: PlayBillingConnector? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun handleOnDestroy() {
        billing?.close()
        client?.close()
        scope.cancel()
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val apiKey = call.getString("apiKey")
        val baseUrl = call.getString("baseUrl")
        if (apiKey == null || baseUrl == null) {
            call.reject("apiKey and baseUrl are required", "invalid")
            return
        }

        fun duration(key: String, fallbackMs: Long) =
            (call.getDouble(key)?.toLong() ?: fallbackMs).milliseconds

        val created = RevnixClient(
            RevnixConfig(
                apiKey = apiKey,
                baseUrl = baseUrl,
                storage = AndroidStorage(context),
                timeout = duration("timeoutMs", 10_000),
                offlineMaxCacheAge = duration("offlineMaxCacheAgeMs", 14L * 24 * 3600 * 1000),
                entitlementsTtl = duration("entitlementsTtlMs", 30_000),
                onDiagnostic = { event ->
                    notifyListeners(
                        "diagnostic",
                        JSObject().apply {
                            put("op", event.op)
                            put("message", event.message)
                        },
                    )
                },
            )
        )
        client = created
        // Owns connection, purchase replay, acknowledgement, and the queue drain.
        billing = PlayBillingConnector.start(context, created)
        scope.launch {
            created.registerInstall(platform = "android-capacitor", appVersion = null)
        }
        call.resolve()
    }

    private fun requireClient(call: PluginCall): RevnixClient? {
        val active = client
        if (active == null) {
            call.reject("Revnix.configure() must be called first", "invalid")
        }
        return active
    }

    // MARK: - Identity

    @PluginMethod
    fun getCustomerId(call: PluginCall) {
        val active = requireClient(call) ?: return
        call.resolve(JSObject().put("customerId", active.customerId()))
    }

    @PluginMethod
    fun logout(call: PluginCall) {
        val active = requireClient(call) ?: return
        call.resolve(JSObject().put("customerId", active.logout()))
    }

    // MARK: - Entitlements

    @PluginMethod
    fun getEntitlements(call: PluginCall) {
        val active = requireClient(call) ?: return
        scope.launch {
            try {
                call.resolve(js(active.entitlements()))
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    @PluginMethod
    fun getCachedEntitlements(call: PluginCall) {
        val active = requireClient(call) ?: return
        val snapshot = active.cachedEntitlements()
        val out = JSObject()
        if (snapshot == null) out.put("snapshot", JSONObject.NULL)
        else out.put("snapshot", js(snapshot))
        call.resolve(out)
    }

    @PluginMethod
    fun isEntitled(call: PluginCall) {
        val active = requireClient(call) ?: return
        val entitlementId = call.getString("entitlementId") ?: ""
        scope.launch {
            call.resolve(JSObject().put("entitled", active.isEntitled(entitlementId)))
        }
    }

    @PluginMethod
    fun waitForEntitlements(call: PluginCall) {
        val active = requireClient(call) ?: return
        val seq = (call.getDouble("seq") ?: 0.0).toLong()
        scope.launch {
            try {
                call.resolve(js(active.waitForEntitlements(seq)))
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    // MARK: - Purchases

    @PluginMethod
    fun registerPurchase(call: PluginCall) {
        val active = requireClient(call) ?: return
        val token = call.getString("token")
        val productId = call.getString("productId")
        val transactionId = call.getString("transactionId")
        if (token == null || productId == null || transactionId == null) {
            call.reject("token, productId and transactionId are required", "invalid")
            return
        }
        val input = RegisterPurchaseInput(
            source = RevnixStore.fromWire(call.getString("source") ?: "google"),
            token = token,
            productId = productId,
            transactionId = transactionId,
            occurredAt = call.getDouble("occurredAt")?.toLong(),
            expiresAt = call.getDouble("expiresAt")?.toLong(),
            signedTransactionInfo = call.getString("signedTransactionInfo"),
        )
        scope.launch {
            try {
                call.resolve(js(active.registerPurchase(input)))
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    @PluginMethod
    fun retryPendingPurchases(call: PluginCall) {
        val active = requireClient(call) ?: return
        scope.launch {
            call.resolve(JSObject().put("delivered", active.retryPendingPurchases()))
        }
    }

    @PluginMethod
    fun pendingPurchaseCount(call: PluginCall) {
        val active = requireClient(call) ?: return
        call.resolve(JSObject().put("count", active.pendingPurchaseCount()))
    }

    // MARK: - Placements & telemetry

    @PluginMethod
    fun resolvePlacement(call: PluginCall) {
        val active = requireClient(call) ?: return
        val key = call.getString("placementKey") ?: ""
        scope.launch {
            try {
                call.resolve(js(active.resolvePlacement(key)))
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    @PluginMethod
    fun registerInstall(call: PluginCall) {
        val active = requireClient(call) ?: return
        val platform = call.getString("platform") ?: "android-capacitor"
        val appVersion = call.getString("appVersion")
        scope.launch {
            active.registerInstall(platform = platform, appVersion = appVersion)
            call.resolve()
        }
    }

    @PluginMethod
    fun logPaywallShown(call: PluginCall) {
        val active = requireClient(call) ?: return
        val placementKey = call.getString("placementKey")
        val paywallId = call.getString("paywallId")
        scope.launch {
            active.logPaywallShown(placementKey = placementKey, paywallId = paywallId)
            call.resolve()
        }
    }

    // MARK: - Marshalling

    private fun js(snapshot: CustomerEntitlements): JSObject = JSObject().apply {
        put("customerId", snapshot.customerId)
        put("cursor", snapshot.cursor)
        snapshot.stale?.let { put("stale", it) }
        snapshot.fetchedAt?.let { put("fetchedAt", it) }
        put(
            "entitlements",
            org.json.JSONArray().apply {
                snapshot.entitlements.forEach { ent ->
                    put(JSObject().apply {
                        put("entitlementId", ent.entitlementId)
                        put("isActive", ent.isActive)
                        ent.expiresAt?.let { put("expiresAt", it) }
                        put(
                            "sources",
                            org.json.JSONArray().apply {
                                ent.sources.forEach { src ->
                                    put(JSObject().apply {
                                        put("kind", src.kind)
                                        put("key", src.key)
                                        put("isActive", src.isActive)
                                        src.expiresAt?.let { put("expiresAt", it) }
                                    })
                                }
                            },
                        )
                    })
                }
            },
        )
    }

    private fun js(result: RegisterPurchaseResult): JSObject = JSObject().apply {
        put("eventId", result.eventId)
        put("seq", result.seq)
        put("duplicate", result.duplicate)
        put("customerId", result.customerId)
        put("transferred", result.transferred)
        result.ownedByOtherCustomer?.let { put("ownedByOtherCustomer", it) }
        result.refused?.let { put("refused", it) }
        result.restored?.let { put("restored", it) }
        result.provisional?.let { put("provisional", it) }
    }

    private fun js(resolution: PlacementResolution): JSObject = JSObject().apply {
        put("status", resolution.status)
        put("placementKey", resolution.placementKey)
        put("revision", resolution.revision)
        put(
            "offering",
            JSObject().apply {
                put("offeringId", resolution.offering.offeringId)
                put("displayName", resolution.offering.displayName)
                resolution.offering.metadata?.let { put("metadata", js(it)) }
                put(
                    "packages",
                    org.json.JSONArray().apply {
                        resolution.offering.packages.forEach { pkg ->
                            put(JSObject().apply {
                                put("packageId", pkg.packageId)
                                put("productId", pkg.productId)
                            })
                        }
                    },
                )
            },
        )
        resolution.paywall?.let { put("paywall", js(it)) }
    }

    /** kotlinx JsonElement → org.json, via its canonical string form. */
    private fun js(element: JsonElement): Any {
        val text = element.toString()
        return try {
            when {
                text.startsWith("{") -> JSONObject(text)
                text.startsWith("[") -> org.json.JSONArray(text)
                else -> org.json.JSONObject.wrap(
                    kotlinx.serialization.json.Json.parseToJsonElement(text).toString()
                ) ?: text
            }
        } catch (_: org.json.JSONException) {
            text
        }
    }

    /**
     * The bridge's real contract: a stable code plus `isRetryable`, so JS can
     * rebuild the typed error. Lose this and a kill switch becomes
     * indistinguishable from an outage.
     */
    private fun reject(call: PluginCall, err: Throwable) {
        if (err !is RevnixError) {
            call.reject(
                err.message ?: "unexpected failure", "network", Exception(err),
                JSObject().put("isRetryable", true),
            )
            return
        }
        val data = JSObject().put("isRetryable", err.isRetryable)
        val code = when (err) {
            is RevnixError.Network -> "network"
            is RevnixError.Timeout -> "timeout"
            is RevnixError.RateLimited -> {
                data.put("status", 429)
                err.retryAfterMs?.let { data.put("retryAfterMs", it) }
                "rate_limited"
            }
            is RevnixError.Server -> {
                data.put("status", err.status)
                "server"
            }
            is RevnixError.BadResponse -> "bad_response"
            is RevnixError.Auth -> {
                data.put("status", err.status)
                "auth"
            }
            is RevnixError.NotFound -> {
                data.put("status", 404)
                "not_found"
            }
            is RevnixError.PurchaseBlocked -> {
                data.put("status", 409)
                "purchase_blocked"
            }
            is RevnixError.Invalid -> {
                data.put("status", err.status)
                "invalid"
            }
        }
        call.reject(err.message, code, err, data)
    }
}
