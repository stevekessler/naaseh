import Foundation
import NaasehContracts
import SwiftUI
import UniformTypeIdentifiers

public struct NativeTaskReportFilter: Sendable {
    public var from = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    public var to = Date()
    public var categoryID = ""
    public var projectID = ""
    public var period = "day"
    public var urgencies: Set<TaskUrgency> = []
    public init() {}
    public var fields: [String: JSONValue] {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        var result: [String: JSONValue] = ["from": .string(formatter.string(from: from)), "to": .string(formatter.string(from: to)),
            "period": .string(period), "weekStartsOn": .number(Decimal(Calendar.current.firstWeekday - 1)),
            "urgencies": .array(TaskUrgency.allCases.filter { urgencies.contains($0) }.map { .string($0.rawValue) })]
        if !categoryID.isEmpty { result["categoryId"] = .string(categoryID) }
        if !projectID.isEmpty { result["projectId"] = .string(projectID) }
        return result
    }
    public var query: String {
        var components = URLComponents()
        var items: [URLQueryItem] = [URLQueryItem(name: "browserTimeZone", value: TimeZone.current.identifier)]
        for (key, value) in fields {
            switch value {
            case let .string(text): items.append(.init(name: key, value: text))
            case let .number(number): items.append(.init(name: key, value: "\(number)"))
            case let .array(values):
                let text = values.compactMap { if case let .string(v) = $0 { return v }; return nil }.joined(separator: ",")
                if !text.isEmpty { items.append(.init(name: key, value: text)) }
            default: break
            }
        }
        components.queryItems = items.sorted { $0.name < $1.name }
        return components.percentEncodedQuery ?? ""
    }
}

public struct NativeTaskReportsView: View {
    @Environment(\.scenePhase) private var phase
    @Bindable private var model: TaskWorkspaceModel
    @State private var filter = NativeTaskReportFilter()
    @State private var loading = false
    @State private var cached = false
    @State private var error: String?
    @State private var operation: Task<Void, Never>?
    @State private var exportFile: NativeTaskFile?
    @State private var showingExport = false
    @State private var appliedQuery = ""
    @State private var appliedFilters = JSONValue.null
    private struct Cache: Codable { let id: String; let report: NativeCompletionReport; let details: [NativeCompletionDetail] }
    public init(model: TaskWorkspaceModel) { self.model = model }
    public var body: some View {
        List {
            Section("Report filters") {
                DatePicker("From", selection: $filter.from, displayedComponents: .date)
                DatePicker("Through", selection: $filter.to, displayedComponents: .date)
                Picker("Group by", selection: $filter.period) {
                    Text("Day").tag("day"); Text("Week").tag("week"); Text("Month").tag("month")
                }
                Picker("Category", selection: $filter.categoryID) {
                    Text("All categories").tag("")
                    ForEach(model.references.categories) { Text($0.name).tag($0.id) }
                }
                Picker("Project", selection: $filter.projectID) {
                    Text("All projects").tag("")
                    ForEach(model.references.projects) { Text($0.name).tag($0.id) }
                }
                ForEach(TaskUrgency.allCases, id: \.self) { urgency in
                    Toggle(urgency.rawValue.capitalized, isOn: Binding(get: { filter.urgencies.contains(urgency) }, set: {
                        if $0 { filter.urgencies.insert(urgency) } else { filter.urgencies.remove(urgency) }
                    }))
                }
                Button("Apply filters") { load() }.disabled(loading || filter.from > filter.to)
            }
            if let report = model.completionReport {
                Section(cached ? "Cached report" : "Completed tasks") {
                    LabeledContent("Total completions", value: "\(report.total)")
                    LabeledContent("As of", value: report.asOf)
                    ForEach(TaskUrgency.allCases, id: \.self) { priority in
                        LabeledContent(priority.rawValue.capitalized, value: "\(report.urgencyCounts[priority.rawValue] ?? 0)")
                    }
                    ForEach(report.buckets) { bucket in LabeledContent(bucket.key, value: "\(bucket.count)") }
                    Button("Export verified CSV", systemImage: "square.and.arrow.up") { export() }
                        .disabled(loading || cached || appliedQuery != filter.query)
                }
                Section("Completion history") {
                    ForEach(model.completionDetails) { detail in
                        VStack(alignment: .leading) {
                            Text(model.tasks.first { $0.id == detail.workId }?.label ?? "Task \(detail.workId)")
                            Text("\(detail.urgencyAtCompletion.capitalized) · \(detail.completedAt ?? "")").font(.caption)
                        }
                    }
                }
            }
            if loading { Section { ProgressView("Preparing report…"); Button("Cancel") { operation?.cancel() } } }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .navigationTitle("Completed Tasks")
        .task { load() }
        .onDisappear { operation?.cancel(); exportFile = nil }
        .onChange(of: phase) { _, value in if value != .active { operation?.cancel(); exportFile = nil } }
        .fileExporter(isPresented: $showingExport, document: exportFile, contentType: .commaSeparatedText, defaultFilename: "completed-tasks.csv") { result in
            if case .failure(let failure) = result { error = failure.localizedDescription }
            exportFile = nil
        }
    }
    private func load() {
        guard !loading else { return }
        loading = true; error = nil
        let selected = filter
        operation = Task { @MainActor in
            defer { loading = false; operation = nil }
            do {
                guard let client = model.featureClient else { throw NativeTaskFeatureError.unavailable }
                let report = try await client.completionReport(query: selected.query)
                let details = try await client.completionDetails(query: selected.query)
                try Task.checkCancellation()
                model.completionReport = report; model.completionDetails = details; cached = false
                appliedQuery = selected.query; appliedFilters = .object(selected.fields)
                let value = Cache(id: selected.query, report: report, details: details)
                try await model.cache(value, kind: .report, id: "completion-report")
            } catch is CancellationError {} catch {
                self.error = error.localizedDescription
                if let values = try? await model.cachedValues(.report) {
                    for value in values {
                        if let saved = try? JSONDecoder().decode(Cache.self, from: JSONEncoder().encode(value)), saved.id == selected.query, !Task.isCancelled {
                            model.completionReport = saved.report; model.completionDetails = saved.details; cached = true; break
                        }
                    }
                }
            }
        }
    }
    private func export() {
        guard !loading, let client = model.featureClient, let report = model.completionReport else { return }
        loading = true; error = nil
        let filters = appliedFilters
        operation = Task { @MainActor in
            defer { loading = false; operation = nil }
            do {
                let bytes = try await client.completionCSV(filters: filters, asOf: report.asOf)
                try Task.checkCancellation()
                exportFile = NativeTaskFile(data: bytes); showingExport = true
            } catch is CancellationError {} catch { self.error = error.localizedDescription }
        }
    }
}
