import Foundation
import Observation
import NaasehServices
import UserNotifications
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@MainActor @Observable
public final class NativeTaskNotificationCoordinator: NSObject, UNUserNotificationCenterDelegate {
    public static var shared: NativeTaskNotificationCoordinator?
    public var enabled = UserDefaults.standard.bool(forKey: "naaseh.task-reminders")
    public var error: String?
    public var openTask: ((String) -> Void)?
    public private(set) var pendingTaskID: String?
    private let client: NativeTaskFeatureClient
    private let clientID: String
    private let center = UNUserNotificationCenter.current()
    private var token: Data?
    private var remoteRegistered = false

    public init(client: NativeTaskFeatureClient, clientID: String) {
        self.client = client; self.clientID = clientID
        super.init()
        center.delegate = self
        Self.shared = self
        if enabled { registerRemote() }
    }
    public func enable() async {
        do {
            guard try await center.requestAuthorization(options: [.alert, .sound, .badge]) else { throw NativeNotificationServiceError.permissionDenied }
            enabled = true; error = nil; UserDefaults.standard.set(true, forKey: "naaseh.task-reminders")
            registerRemote()
        } catch { self.error = "Allow notifications in system settings to enable reminders." }
    }
    public func disable() async {
        if remoteRegistered { try? await client.unregisterNotifications(clientID: clientID) }
        enabled = false; remoteRegistered = false; token = nil
        UserDefaults.standard.set(false, forKey: "naaseh.task-reminders")
        center.removeAllPendingNotificationRequests(); center.removeAllDeliveredNotifications()
    }
    public func registered(token: Data) async {
        self.token = token
        guard enabled else { return }
        do {
            #if DEBUG
            let environment: NativePushEnvironment = .sandbox
            #else
            let environment: NativePushEnvironment = .production
            #endif
            #if os(macOS)
            let platform: NativeNotificationPlatform = .macos
            let topic = "link.thepandas.naaseh.macos"
            #else
            let platform: NativeNotificationPlatform = UIDevice.current.userInterfaceIdiom == .pad ? .ipados : .ios
            let topic = "link.thepandas.naaseh"
            #endif
            let service = NativeNotificationService(transport: APINativeNotificationTransport(client: await client.apiClient(), credential: await client.sessionProvider()), platform: platform, topic: topic)
            await service.updateAuthorization(.authorized)
            try await service.register(token: token, clientID: clientID, environment: environment)
            remoteRegistered = true; error = nil
        } catch { remoteRegistered = false; self.error = "Remote reminders will retry when this device reconnects." }
    }
    public func registrationFailed() { remoteRegistered = false; error = "Using reminders scheduled on this device until remote registration succeeds." }
    public func reconcile(tasks: [TaskRecord], timer: NativeAccountTaskTimer?, pendingTaskIDs: Set<String>, now: Date = Date()) async {
        guard enabled else { return }
        if let token, !remoteRegistered { await registered(token: token) }
        let old = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix("task:") || $0.identifier.hasPrefix("timer:") }
        center.removePendingNotificationRequests(withIdentifiers: old.map(\.identifier))
        let due = tasks.filter { $0.lifecycle == .active && $0.completionState == .open && (!remoteRegistered || pendingTaskIDs.contains($0.id)) }
            .compactMap { task -> (TaskRecord, Date)? in
                if let instant = task.due?.instant { return instant > Date() ? (task, instant) : nil }
                return nil
            }.sorted { $0.1 < $1.1 }
        do {
            for (task, instant) in due.prefix(48) {
                let id = "task:\(task.id):\(Int(instant.timeIntervalSince1970))"
                try await schedule(id: id, taskID: task.id, at: instant, timer: false)
            }
            if let stored = timer {
                let timer = stored.effective(at: now).timer
                if timer.status == "running", let end = NativeAccountTaskTimer.date(timer.endsAt), end > now {
                try await schedule(id: "timer:\(timer.runId):\(timer.intervalOrdinal)", taskID: timer.taskId, at: Date().addingTimeInterval(end.timeIntervalSince(now)), timer: true)
                }
            }
        } catch { self.error = "A reminder could not be scheduled. Refresh to retry." }
    }
    private func schedule(id: String, taskID: String, at date: Date, timer: Bool) async throws {
        let content = UNMutableNotificationContent()
        content.title = timer ? "Na’aseh timer" : "Na’aseh reminder"
        content.body = timer ? "Your timer interval has finished." : "A task is due."
        content.sound = .default
        content.userInfo = ["taskId": taskID]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, date.timeIntervalSinceNow), repeats: false)
        try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
    private func registerRemote() {
        #if os(iOS)
        UIApplication.shared.registerForRemoteNotifications()
        #elseif os(macOS)
        NSApplication.shared.registerForRemoteNotifications()
        #endif
    }
    public func routePending(authorizedIDs: Set<String>) {
        guard let id = pendingTaskID, authorizedIDs.contains(id) else { return }
        pendingTaskID = nil; openTask?(id)
    }
    public nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let taskID = response.notification.request.content.userInfo["taskId"] as? String
        guard let taskID else { return }
        await MainActor.run { self.pendingTaskID = taskID; self.openTask?(taskID) }
    }
    public nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}

public extension NativeTaskFeatureClient {
    func apiClient() -> APIClient { client }
    func sessionProvider() -> @Sendable () async throws -> NativeSessionCredential { credential }
    func unregisterNotifications(clientID: String) async throws {
        _ = try await data("/api/v1/push-subscriptions?kind=apple&clientId=\(component(clientID))", method: "DELETE")
    }
}
