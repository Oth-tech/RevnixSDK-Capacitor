package com.getcapacitor

import com.revnix.MemoryStorage
import com.revnix.PlacementResolution
import com.revnix.RevnixClient
import com.revnix.RevnixConfig
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Smoke tests over the vendored revnix-kotlin core — the deep behavioral
 * suite lives upstream in the revnix-kotlin repo; this just proves the
 * vendored copy is wired into the plugin module correctly.
 */
class ExampleUnitTest {

    private val json = Json { ignoreUnknownKeys = true }

    private val experimentBody =
        """{"status":"ok","placementKey":"main","revision":4,"offering":{"offeringId":"off_2","displayName":"Variant B","packages":[{"packageId":"pkg_2","productId":"pro.annual"}]},"experiment":{"key":"summer-pricing","variantId":"var_b"}}"""

    /** Serves a canned 200 and records the request — no network involved. */
    private fun stubClient(body: String, onRequest: (Request) -> Unit = {}): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                onRequest(chain.request())
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(body.toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()

    // MARK: - Experiments (REV-219)

    @Test
    fun `resolvePlacement sends the customer id and carries the experiment through`() {
        var sent: Request? = null
        val storage = MemoryStorage()
        // An id with a space proves the query parameter is URL-encoded.
        storage.set("revnix.customerId", "cust one")
        val client = RevnixClient(
            RevnixConfig(
                apiKey = "rvx_pk_test",
                baseUrl = "https://api.example",
                storage = storage,
                httpClient = stubClient(experimentBody) { sent = it },
            )
        )
        val resolution = runBlocking { client.resolvePlacement("main") }
        // The bridge forwards the raw wire value, so that is what is checked.
        val experiment = resolution.experimentJson!!.jsonObject
        assertEquals("summer-pricing", experiment["key"]?.jsonPrimitive?.content)
        assertEquals("var_b", experiment["variantId"]?.jsonPrimitive?.content)
        val url = sent!!.url
        assertEquals("cust one", url.queryParameter("customer"))
        assertTrue(url.toString(), url.toString().endsWith("/offering?customer=cust%20one"))
    }

    @Test
    fun `a null or absent experiment field decodes as null`() {
        val nullBody =
            """{"status":"ok","placementKey":"main","revision":1,"offering":{"offeringId":"off_1","displayName":"Default","packages":[]},"experiment":null}"""
        val absentBody =
            """{"status":"ok","placementKey":"main","revision":1,"offering":{"offeringId":"off_1","displayName":"Default","packages":[]}}"""
        for (body in listOf(nullBody, absentBody)) {
            val resolution = json.decodeFromString(PlacementResolution.serializer(), body)
            // The bridge surfaces both as JS null.
            assertTrue(resolution.experimentJson == null || resolution.experimentJson is JsonNull)
            assertTrue(resolution.experiment == null)
        }
    }
}
