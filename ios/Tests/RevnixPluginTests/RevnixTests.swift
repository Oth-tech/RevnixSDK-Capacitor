import XCTest

@testable import RevnixPlugin

/// Smoke tests over the vendored revnix-swift core — the deep behavioral
/// suite lives upstream in the revnix-swift repo (27 cases); this just proves
/// the vendored copy is wired into the plugin target correctly.
class RevnixTests: XCTestCase {
    func testErrorTaxonomy() {
        XCTAssertTrue(RevnixError.fromHttp(status: 503, message: "").isRetryable)
        XCTAssertFalse(RevnixError.fromHttp(status: 403, message: "").isRetryable)
        if case .purchaseBlocked = RevnixError.fromHttp(status: 409, message: "policy") {
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
}
