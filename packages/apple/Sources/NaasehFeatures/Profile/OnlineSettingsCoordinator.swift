import Foundation

public enum OnlineSettingsMessage: Equatable, Sendable { case saved, unchanged, unsavedOffline, failed(String) }
public actor OnlineSettingsCoordinator {
    public private(set) var message: OnlineSettingsMessage?
    public init() {}
    @discardableResult public func perform<Value: Equatable & Sendable>(current: Value, proposed: Value, online: Bool, operation: @Sendable () async throws -> Value) async -> OnlineSettingsMessage {
        guard current != proposed else { message = .unchanged; return .unchanged }
        guard online else { message = .unsavedOffline; return .unsavedOffline }
        do { _ = try await operation(); message = .saved; return .saved } catch { let value = OnlineSettingsMessage.failed("The setting was not saved. Try again while online."); message = value; return value }
    }
}
