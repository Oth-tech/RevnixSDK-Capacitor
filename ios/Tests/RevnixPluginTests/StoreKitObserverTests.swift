import Capacitor
import XCTest

@testable import RevnixPlugin

#if canImport(Revnix)
    import Revnix
#endif

/// The StoreKit 2 observer is the plugin's only long-lived native job, and
/// `configure` owns its lifecycle: start it bound to the client that was
/// just built, retire the previous one on a re-configure, start nothing
/// when configure rejects. Real transactions can't be driven from a unit
/// test; the binding and the lifecycle can, through the plugin's seams.
final class StoreKitObserverTests: XCTestCase {

    /// A plugin whose `configure` never touches the disk or the network,
    /// and whose observer records which client it was bound to.
    private final class Harness {
        let plugin = RevnixPlugin()
        private(set) var boundClients: [RevnixClient] = []

        init() {
            let config = URLSessionConfiguration.ephemeral
            config.protocolClasses = [ObserverStubProtocol.self]
            let session = URLSession(configuration: config)
            plugin.configOverride = {
                $0.storage = MemoryStorage()
                $0.session = session
            }
            plugin.startObserver = { [unowned self] client in
                boundClients.append(client)
                // Parks until cancelled, like the real Transaction.updates loop.
                return Task { while !Task.isCancelled { await Task.yield() } }
            }
        }

        /// Runs `configure` and reports whether it resolved. Capacitor
        /// resolves/rejects synchronously inside the call.
        @discardableResult
        func configure(_ options: [String: Any] = Harness.validOptions) -> Bool {
            var resolved = false
            plugin.configure(
                CAPPluginCall(
                    callbackId: UUID().uuidString, methodName: "configure", options: options,
                    success: { _, _ in resolved = true },
                    error: { _ in }))
            return resolved
        }

        static let validOptions: [String: Any] = [
            "apiKey": "rvx_pk_test", "baseUrl": "https://api.example",
        ]
    }

    func testConfigureStartsOneObserverBoundToTheNewClient() throws {
        let h = Harness()
        XCTAssertNil(h.plugin.observer, "nothing observes before configure")

        XCTAssertTrue(h.configure())

        let observer = try XCTUnwrap(h.plugin.observer)
        XCTAssertFalse(observer.isCancelled)
        XCTAssertEqual(h.boundClients.count, 1, "exactly one observer per configure")
        observer.cancel()
    }

    func testReconfigureRetiresThePreviousObserverAndBindsTheNewClient() throws {
        let h = Harness()
        h.configure()
        let previous = try XCTUnwrap(h.plugin.observer)

        h.configure()
        let current = try XCTUnwrap(h.plugin.observer)

        XCTAssertTrue(previous.isCancelled, "the observer bound to the old client must stop")
        XCTAssertFalse(current.isCancelled, "the new client gets a live observer")
        XCTAssertEqual(h.boundClients.count, 2)
        XCTAssertTrue(
            h.boundClients[0] !== h.boundClients[1],
            "the second observer is bound to the second client, not the first")
        current.cancel()
    }

    func testRejectedConfigureStartsNothing() {
        let h = Harness()
        XCTAssertFalse(h.configure(["apiKey": "rvx_pk_test"]), "baseUrl is required")
        XCTAssertNil(h.plugin.observer, "no client, no observer")
        XCTAssertTrue(h.boundClients.isEmpty)
    }

    /// A rejected re-configure changes nothing: the previous client stays,
    /// and so does the observer bound to it — the two are never split.
    func testRejectedReconfigureKeepsThePreviousObserver() throws {
        let h = Harness()
        h.configure()
        let previous = try XCTUnwrap(h.plugin.observer)

        // An empty string is the one input URL(string:) refuses on every
        // Foundation version (iOS 17+ tolerates most junk).
        XCTAssertFalse(h.configure(["apiKey": "rvx_pk_test", "baseUrl": ""]))

        XCTAssertTrue(h.plugin.observer == previous, "same task handle, nothing restarted")
        XCTAssertFalse(previous.isCancelled)
        XCTAssertEqual(h.boundClients.count, 1)
        previous.cancel()
    }

    /// Production wiring: without the seam, the observer is revnix-swift's
    /// `Transaction.updates` loop, which honours cancellation (the pattern
    /// Apple's own listener sample relies on).
    func testDefaultObserverIsTheStoreKitLoop() {
        let plugin = RevnixPlugin()
        let client = RevnixClient(
            RevnixConfig(
                apiKey: "rvx_pk_test", baseURL: URL(string: "https://api.example")!,
                storage: MemoryStorage()))
        let task = plugin.startObserver(client)
        task.cancel()
        XCTAssertTrue(task.isCancelled)
    }
}

/// Answers every request with an empty 200 so `configure`'s launch chores
/// (queue drain, install beacon) complete without a network.
final class ObserverStubProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let response = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
