import AppKit
import NaasehFeatures

@MainActor
final class TaskNotificationDelegate: NSObject, NSApplicationDelegate {
    func application(_ application: NSApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { await NativeTaskNotificationCoordinator.shared?.registered(token: deviceToken) }
    }
    func application(_ application: NSApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NativeTaskNotificationCoordinator.shared?.registrationFailed()
    }
}
