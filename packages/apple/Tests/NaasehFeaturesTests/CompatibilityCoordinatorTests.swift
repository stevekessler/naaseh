import NaasehFeatures
import NaasehServices
import Testing

@Suite("Release compatibility") struct CompatibilityCoordinatorTests {
    private let supported = APICompatibilityDecision(
        mode: "supported", minimumBuild: 1, latestBuild: 1,
        supportedContractVersions: [4], messageCode: "ok"
    )

    @Test("blocking states preserve pending work and never permit mutation")
    func blockingStates() async {
        let coordinator = CompatibilityCoordinator()
        for code in ["update_required", "beta_expired", "service_temporarily_unavailable"] {
            let response = APICompatibilityDecision(
                mode: "upgradeRequired", minimumBuild: 2, latestBuild: 2,
                supportedContractVersions: [4], messageCode: code
            )
            let state = await coordinator.evaluate(
                response: response, networkReachable: true, supportedHardware: true,
                siriAI: .available, hasEncryptedPendingWork: true
            )
            #expect(state.mutationsAllowed == false)
            #expect(state.pendingWorkPreserved)
        }
    }

    @Test("offline work is allowed only after a supported decision")
    func offlineGate() async {
        let coordinator = CompatibilityCoordinator()
        let coldOffline = await coordinator.evaluate(
            response: nil, networkReachable: false, supportedHardware: true,
            siriAI: .unavailable(reason: "disabled"), hasEncryptedPendingWork: false
        )
        #expect(coldOffline.client == .ordinaryOffline)
        #expect(coldOffline.mutationsAllowed == false)
        _ = await coordinator.evaluate(
            response: supported, networkReachable: true, supportedHardware: true,
            siriAI: .available, hasEncryptedPendingWork: false
        )
        let warmOffline = await coordinator.evaluate(
            response: nil, networkReachable: false, supportedHardware: true,
            siriAI: .unavailable(reason: "not downloaded"), hasEncryptedPendingWork: true
        )
        #expect(warmOffline.mutationsAllowed)
        #expect(warmOffline.pendingWorkPreserved)
    }
}
