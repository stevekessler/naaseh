import Foundation
import NaasehServices
import Testing

@Suite("Native alert coordination")
struct AlertCoordinatorTests {
    @Test("permission, token rotation, preview, and unregister are explicit")
    func registration() async throws {
        let transport = RecordingNotificationTransport()
        let service = NativeNotificationService(transport: transport, platform: .ios, topic: "link.thepandas.naaseh")
        await service.updateAuthorization(.authorized)
        try await service.register(token: Data(repeating: 0xAB, count: 32), clientID: "phone", environment: .sandbox)
        try await service.register(token: Data(repeating: 0xCD, count: 32), clientID: "phone", environment: .sandbox)
        #expect(await transport.registrations.count == 2)
        #expect(await transport.registrations.last?.previewPolicy == .generic)
        try await service.unregister(clientID: "phone")
        #expect(await transport.unregistered == ["phone"])
    }

    @Test("local and remote occurrences reconcile without duplicates and purge private content")
    func reconciliation() async throws {
        let notifications = MemoryNotificationScheduler()
        let coordinator = AlertCoordinator(scheduler: notifications)
        let reminder = NativeReminder(id: "r1", taskID: "t1", dueAt: Date().addingTimeInterval(60), occurrenceID: "o1")
        try await coordinator.schedule(reminder, privatePreview: "Private title")
        await coordinator.reconcileDelivered(occurrenceID: "o1")
        await coordinator.reconcileDelivered(occurrenceID: "o1")
        #expect(await coordinator.deliveredOccurrenceIDs == ["o1"])
        await coordinator.protectedDataDidBecomeUnavailable()
        #expect(await notifications.pending.first?.body == "A task is due.")
    }

    @Test("stale actions route to safe unavailable state")
    func staleAction() async {
        let coordinator = AlertCoordinator(scheduler: MemoryNotificationScheduler())
        #expect(await coordinator.handleAction(occurrenceID: "missing") == .stale)
    }
}
