import SwiftUI
import NaasehContracts

public struct NativeFinancialTaskLink: Codable, Sendable {
    let id: String
    let budgetId: String
    let budgetItemId: String
}
public extension NativeTaskFeatureClient {
    func financialTaskLink(_ taskID: String) async throws -> NativeFinancialTaskLink? {
        struct Response: Decodable { let link: NativeFinancialTaskLink? }
        return try await json("/api/v1/finance/tasks/\(component(taskID))/link", as: Response.self).link
    }
    func relatedBudget(_ link: NativeFinancialTaskLink) async throws -> JSONValue {
        try await json("/api/v1/finance/budgets/\(component(link.budgetId))", as: JSONValue.self)
    }
}

public struct NativeTaskFinanceLinkView: View {
    @Environment(\.scenePhase) private var phase
    let client: NativeTaskFeatureClient?
    let taskID: String
    @State private var link: NativeFinancialTaskLink?
    public var body: some View {
        Group {
            if let link, let client, phase == .active {
                NavigationLink { RelatedBudgetItemView(client: client, link: link) } label: { Label("Open related financial item", systemImage: "banknote") }
            }
        }
        .task(id: taskID) {
            do {
                let value = try await client?.financialTaskLink(taskID)
                try Task.checkCancellation()
                if phase == .active { link = value }
            } catch { link = nil }
        }
        .onChange(of: phase) { _, value in if value != .active { link = nil } }
        .onDisappear { link = nil }
    }
}

private struct RelatedBudgetItemView: View {
    @Environment(\.scenePhase) private var phase
    let client: NativeTaskFeatureClient
    let link: NativeFinancialTaskLink
    @State private var budget: JSONValue?
    @State private var failed = false
    var body: some View {
        Group {
            if phase == .active, case let .object(fields) = budget, case let .array(items) = fields["items"],
               let item = items.first(where: { if case let .object(value) = $0 { return value["id"] == .string(link.budgetItemId) }; return false }),
               case let .object(values) = item {
                Form {
                    Section(string(fields["name"])) {
                        LabeledContent("Item", value: string(values["description"]))
                        LabeledContent("Planned", value: money(values["plannedAmountMinor"], fields: values))
                        LabeledContent("Actual", value: money(values["actualAmountMinor"], fields: values))
                        LabeledContent("Variance", value: money(values["varianceMinor"], fields: values))
                        LabeledContent("Date", value: string(values["applicableDate"]))
                        LabeledContent("Budget status", value: string(fields["status"]))
                    }
                }
            } else if failed { ContentUnavailableView("Financial Item Unavailable", systemImage: "lock.shield") }
            else { ProgressView("Loading financial item…") }
        }
        .privacySensitive()
        .navigationTitle("Related Financial Item")
        .task {
            do {
                let value = try await client.relatedBudget(link)
                try Task.checkCancellation()
                guard case let .object(fields) = value, case let .array(items) = fields["items"],
                      items.contains(where: { if case let .object(item) = $0 { return item["id"] == .string(link.budgetItemId) }; return false }) else { throw NativeTaskFeatureError.permission }
                budget = value
            }
            catch { failed = true }
        }
        .onDisappear { budget = nil }
        .onChange(of: phase) { _, value in if value != .active { budget = nil } }
    }
    private func string(_ value: JSONValue?) -> String { if case let .string(text) = value { return text }; return "" }
    private func money(_ value: JSONValue?, fields: [String: JSONValue]) -> String {
        guard case let .number(amount) = value else { return "" }
        let exponent: Int = if case let .number(value) = fields["currencyExponent"] { NSDecimalNumber(decimal: value).intValue } else { 2 }
        var divisor = Decimal(1); for _ in 0..<max(0, min(6, exponent)) { divisor *= 10 }
        let formatter = NumberFormatter(); formatter.numberStyle = .currency; formatter.currencyCode = string(fields["currency"])
        return formatter.string(from: NSDecimalNumber(decimal: amount / divisor)) ?? ""
    }
}
