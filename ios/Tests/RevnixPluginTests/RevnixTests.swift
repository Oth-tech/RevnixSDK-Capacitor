import XCTest

@testable import RevnixPlugin

/// Smoke tests over the vendored revnix-swift core — the deep behavioral
/// suite lives upstream in the revnix-swift repo (31 cases); this just proves
/// the vendored copy is wired into the plugin target correctly.
class RevnixTests: XCTestCase {
    func testErrorTaxonomy() {
        XCTAssertTrue(RevnixError.fromHTTP(status: 503, message: "").isRetryable)
        XCTAssertFalse(RevnixError.fromHTTP(status: 403, message: "").isRetryable)
        if case .purchaseBlocked = RevnixError.fromHTTP(status: 409, message: "policy") {
        } else {
            XCTFail("409 must map to purchaseBlocked")
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
    /// to the bridge untouched.
    func testResolveSendsCustomerIdAndCarriesExperiment() async throws {
        PlacementStubProtocol.body = Self.experimentBody
        let storage = MemoryStorage()
        // An id with a space proves the query item is percent-encoded.
        storage.set("revnix.customerId", "cust one")
        let resolution = try await makeClient(storage: storage).resolvePlacement("main")
        XCTAssertEqual(
            resolution.experiment,
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
        }
    }
}

/// Captures the request URL and serves a canned 200 so the vendored client
/// can be exercised without a network.
final class PlacementStubProtocol: URLProtocol {
    static var lastURL: URL?
    static var body = ""

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastURL = request.url
        let response = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(Self.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
