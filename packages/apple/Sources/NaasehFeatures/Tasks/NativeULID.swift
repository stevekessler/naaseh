import Foundation

public enum NativeULID {
    private static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    public static func make(now: Date = Date()) -> String {
        var milliseconds = UInt64(max(0, now.timeIntervalSince1970 * 1_000))
        var timestamp = Array(repeating: Character("0"), count: 10)
        for index in stride(from: 9, through: 0, by: -1) {
            timestamp[index] = alphabet[Int(milliseconds & 31)]
            milliseconds >>= 5
        }
        var generator = SystemRandomNumberGenerator()
        let randomness = (0 ..< 16).map { _ in alphabet[Int.random(in: 0 ..< 32, using: &generator)] }
        return String(timestamp + randomness)
    }
}
