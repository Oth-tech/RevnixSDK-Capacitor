import XCTest

@testable import RevnixPlugin

#if canImport(Revnix)
    import Revnix
#endif

/// Smoke tests over the revnix-swift core (the ios/Revnix submodule) — the
/// deep behavioral suite lives upstream in that repo; this just proves the
/// submodule is wired into the plugin target correctly.
class RevnixTests: XCTestCase {
    /// The retryable/deliberate split is the contract the JS side keys on;
    /// only the public surface is reachable here (the submodule is its own
    /// module under Swift Package Manager).
    func testErrorTaxonomy() {
        XCTAssertTrue(RevnixError.server(503).isRetryable)
        XCTAssertTrue(RevnixError.timeout.isRetryable)
        XCTAssertFalse(RevnixError.auth(403).isRetryable)
        XCTAssertFalse(RevnixError.purchaseBlocked("policy").isRetryable)
        XCTAssertEqual(RevnixError.rateLimited(retryAfterMs: 250).retryAfterMs, 250)
    }

    /// The status → case mapping the bridge's `describe()` relies on, driven
    /// through the client rather than the (internal) mapper: a 409 must reach
    /// the plugin as `purchaseBlocked`, a 503 as a retryable server error.
    func testHttpStatusesMapToTheTaxonomyTheBridgeReports() async {
        PlacementStubProtocol.body = #"{"error":"policy"}"#
        PlacementStubProtocol.status = 409
        defer { PlacementStubProtocol.status = 200 }
        do {
            _ = try await makeClient().resolvePlacement("main")
            XCTFail("409 must throw")
        } catch let err as RevnixError {
            guard case .purchaseBlocked = err else { return XCTFail("409 must map to purchaseBlocked, got \(err)") }
        } catch {
            XCTFail("unexpected \(error)")
        }
        PlacementStubProtocol.status = 503
        do {
            _ = try await makeClient().resolvePlacement("main")
            XCTFail("503 must throw")
        } catch let err as RevnixError {
            XCTAssertEqual(err, .server(503))
            XCTAssertTrue(err.isRetryable)
        } catch {
            XCTFail("unexpected \(error)")
        }
    }

    func testMemoryStorage() {
        let storage = MemoryStorage()
        storage.set("k", "v")
        XCTAssertEqual(storage.get("k"), "v")
        storage.remove("k")
        XCTAssertNil(storage.get("k"))
    }

    // MARK: - Experiments (REV-219)

    static let experimentBody = """
        {"status":"ok","placementKey":"main","revision":4,"offering":{"offeringId":"off_2","displayName":"Variant B","packages":[{"packageId":"pkg_2","productId":"pro.annual"}]},"experiment":{"key":"summer-pricing","variantId":"var_b"}}
        """

    private func makeClient(storage: MemoryStorage = MemoryStorage()) -> RevnixClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PlacementStubProtocol.self]
        return RevnixClient(
            RevnixConfig(
                apiKey: "rvx_pk_test", baseURL: URL(string: "https://api.example")!,
                storage: storage, session: URLSession(configuration: config)))
    }

    /// The resolve carries the customer id (URL-encoded) so the server can
    /// pin a sticky variant, and the assignment rides the response through
    /// to the bridge untouched — the bridge forwards the raw wire value.
    func testResolveSendsCustomerIdAndCarriesExperiment() async throws {
        PlacementStubProtocol.body = Self.experimentBody
        let storage = MemoryStorage()
        // An id with a space proves the query item is percent-encoded.
        storage.set("revnix.customerId", "cust one")
        let resolution = try await makeClient(storage: storage).resolvePlacement("main")
        XCTAssertEqual(
            resolution.experimentJSON,
            .object(["key": .string("summer-pricing"), "variantId": .string("var_b")]))
        let url = try XCTUnwrap(PlacementStubProtocol.lastURL)
        XCTAssertTrue(url.absoluteString.hasSuffix("/offering?customer=cust%20one"), "\(url)")
    }

    /// `experiment` is null when nothing is running, and absent entirely on
    /// older servers — both decode to nil, which the bridge puts as JS null.
    func testExperimentNullAndAbsentBothDecodeToNil() throws {
        let nullBody = """
            {"status":"ok","placementKey":"main","revision":1,"offering":{"offeringId":"off_1","displayName":"Default","packages":[]},"experiment":null}
            """
        let absentBody = """
            {"status":"ok","placementKey":"main","revision":1,"offering":{"offeringId":"off_1","displayName":"Default","packages":[]}}
            """
        for body in [nullBody, absentBody] {
            let resolution = try JSONDecoder().decode(
                PlacementResolution.self, from: Data(body.utf8))
            XCTAssertNil(resolution.experiment)
            XCTAssertNil(resolution.experimentJSON)
        }
    }
}

/// Captures the request URL and serves a canned 200 so the native client
/// can be exercised without a network.
final class PlacementStubProtocol: URLProtocol {
    static var lastURL: URL?
    static var body = ""
    static var status = 200

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastURL = request.url
        let response = HTTPURLResponse(
            url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(Self.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
