import NaasehFeatures
import NaasehServices
import Testing

private actor ProfileTransportFixture: ProfileTransport {
    var passwordChanged = false, tfaChanged = false, deviceForgotten = false, sessionRevoked = false
    func saveProfile(_ profile: PersonalProfile) -> PersonalProfile { profile }
    func securityStatus() -> AccountSecurityStatus { .init(tfaEnabled: true, rememberedDevices: ["device"], activeSessionCount: 2) }
    func changePassword(current: String, replacement: String) { passwordChanged = true }
    func setTFA(enabled: Bool, code: String) { tfaChanged = true }
    func forgetDevice(id: String) { deviceForgotten = true }
    func revokeSession(id: String) { sessionRevoked = true }
    func receivedAllSecurityMutations() -> Bool {
        passwordChanged && tfaChanged && deviceForgotten && sessionRevoked
    }
}

@Suite("Personal settings") struct ProfileSettingsTests {
    @Test("profile, device alerts/sounds, credentials, TFA, devices, sessions, and offline denial")
    func settings() async throws {
        let transport = ProfileTransportFixture()
        let service = ProfileService(profile: .init(displayName: "Old", email: "old@example.com"), transport: transport)
        #expect(try await service.updateProfile(.init(displayName: "New", email: "new@example.com"), online: true).displayName == "New")
        await service.updateDevicePreferences(.init(alertsEnabled: false, soundsEnabled: false)); #expect(await service.devicePreferences.alertsEnabled == false)
        #expect(try await service.securityStatus(online: true).activeSessionCount == 2)
        try await service.changePassword(current: "old-password", replacement: "new-password-123", confirmation: "new-password-123", online: true)
        try await service.setTFA(enabled: true, code: "123456", online: true)
        try await service.forgetRememberedDevice(id: "device", online: true); try await service.revokeSession(id: "session", online: true)
        await #expect(throws: ProfileError.offline) { try await service.changePassword(current: "a", replacement: "long-password-1", confirmation: "long-password-1", online: false) }
        #expect(await transport.receivedAllSecurityMutations())
        let coordinator = OnlineSettingsCoordinator()
        #expect(await coordinator.perform(current: false, proposed: true, online: false) { true } == .unsavedOffline)
        #expect(await coordinator.perform(current: true, proposed: true, online: true) { true } == .unchanged)
    }
}
