import UIKit
import NaasehFeatures

@MainActor
final class TaskNotificationDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { await NativeTaskNotificationCoordinator.shared?.registered(token: deviceToken) }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NativeTaskNotificationCoordinator.shared?.registrationFailed()
    }
}
