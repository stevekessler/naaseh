import NaasehFeatures
import Testing

@Suite("Organization parity") struct OrganizationParityTests {
    @Test("native uses authorized existing project/category choices and exposes no lifecycle mutations")
    func boundary() async throws {
        let service = OrganizationService(actorID: "owner", projects: [.init(id: "p", name: "Project"), .init(id: "secret", name: "Secret", authorized: false)], categories: [.init(id: "c", name: "Category")], work: [.init(id: "w", ownerID: "owner", title: "Work")])
        #expect(await service.authorizedProjects().map(\.id) == ["p"])
        #expect(try await service.assign(workID: "w", projectID: "p", categoryID: "c").projectID == "p")
        await #expect(throws: OrganizationError.unauthorized) { try await service.assign(workID: "w", projectID: "secret", categoryID: nil) }
        #expect(try await service.archive(workID: "w").archived)
        #expect(try await service.restore(workID: "w").archived == false)
        await #expect(throws: OrganizationError.projectLifecycleWebOnly) { try await service.createProject() }
        await #expect(throws: OrganizationError.categoryLifecycleWebOnly) { try await service.editCategory() }
    }
}
