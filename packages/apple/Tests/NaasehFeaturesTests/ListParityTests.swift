import Foundation
import NaasehFeatures
import Testing

@Suite("List parity") struct ListParityTests {
    @Test("global items, values, ordering, visibility, copying, completion, reset, and archive remain deterministic")
    func parity() async throws {
        let service = ListService(actorID: "owner")
        let global = GlobalListItem(label: "Synthetic item", defaultValue: 3)
        await service.saveGlobal(global)
        let list = ListRecord(name: "Weekly", ownerID: "owner", visibility: .group, items: [.init(label: "A", globalItemID: global.id, value: 3, credit: 1, order: 0), .init(label: "B", order: 1)])
        let saved = try await service.save(list, mutationID: "create")
        let completed = try await service.completeItem(listID: saved.id, itemID: saved.items[0].id, completed: true)
        #expect(completed.items[0].completed)
        _ = try await service.overrideValue(listID: saved.id, itemID: saved.items[0].id, value: 9)
        #expect(try await service.resetOverrides(listID: saved.id).items.allSatisfy { $0.overrideValue == nil })
        #expect(try await service.reorder(listID: saved.id, itemIDs: saved.items.reversed().map(\.id)).items[0].label == "B")
        #expect(try await service.copy(listID: saved.id, name: "Copy").items.allSatisfy { !$0.completed })
        _ = try await service.archive(listID: saved.id)
        #expect(await service.all().contains { $0.id == saved.id } == false)
        #expect(await service.globalItems() == [global])
    }
}
