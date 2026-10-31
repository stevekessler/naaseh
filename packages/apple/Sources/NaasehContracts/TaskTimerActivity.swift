#if os(iOS)
import ActivityKit
import Foundation

public struct NaasehTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public let phase: String
        public let endDate: Date?
        public let pausedRemainingSeconds: Int?
        public let isLocked: Bool
        public init(phase: String, endDate: Date?, pausedRemainingSeconds: Int?, isLocked: Bool) {
            self.phase = phase; self.endDate = endDate; self.pausedRemainingSeconds = pausedRemainingSeconds; self.isLocked = isLocked
        }
    }
    public let timerID: String
    public init(timerID: String) { self.timerID = timerID }
}
#endif
