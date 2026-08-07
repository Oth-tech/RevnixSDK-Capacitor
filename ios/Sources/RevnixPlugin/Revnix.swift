import Foundation

@objc public class Revnix: NSObject {
    @objc public func echo(_ value: String) -> String {
        print(value)
        return value
    }
}
