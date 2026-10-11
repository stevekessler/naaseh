import NaasehServices
import NaasehDesignSystem
import SwiftUI

public struct ListsWorkspaceView: View {
    private let lists: [ListRecord]
    @Binding private var selection: String?
    public init(lists: [ListRecord], selection: Binding<String?>) { self.lists = lists; _selection = selection }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                NaasehSectionHeader("Lists", eyebrow: "Workspace", detail: "Reusable lists and shared checklists.")
                if lists.isEmpty {
                    ContentUnavailableView("No Lists", systemImage: "list.bullet.rectangle", description: Text("Create a list to get started."))
                        .frame(maxWidth: .infinity, minHeight: 280)
                        .naasehCard()
                } else {
                    VStack(spacing: 0) {
                        ForEach(lists) { list in
                            Button { selection = list.id } label: {
                                HStack {
                                    Label(list.name, systemImage: list.visibility == .group ? "person.2" : "list.bullet")
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.secondary)
                                }
                                .padding(.vertical, NaasehSpacing.compact)
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }
                    }
                    .naasehCard()
                }
            }
            .padding()
            .frame(maxWidth: 1000)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .navigationTitle("Lists")
        .toolbar { Button("New list", systemImage: "plus") {} }
    }
}

public struct OrganizationPickerView: View {
    private let projects: [OrganizationProject]
    private let categories: [OrganizationCategory]
    @Binding private var projectID: String?
    @Binding private var categoryID: String?
    public init(projects: [OrganizationProject], categories: [OrganizationCategory], projectID: Binding<String?>, categoryID: Binding<String?>) { self.projects = projects; self.categories = categories; _projectID = projectID; _categoryID = categoryID }
    public var body: some View { Form { Picker("Existing Project", selection: $projectID) { Text("No project").tag(String?.none); ForEach(projects) { Text($0.name).tag(Optional($0.id)) } }; Picker("Existing Category", selection: $categoryID) { Text("No category").tag(String?.none); ForEach(categories) { Text($0.name).tag(Optional($0.id)) } }; Section { Text("Create and manage projects or categories in the web app.").font(.footnote).foregroundStyle(.secondary) } }.navigationTitle("Organize") }
}

public struct FileWorkflowView: View {
    private let attachments: [NativeAttachment]
    private let chooseFile: () -> Void
    private let choosePhoto: () -> Void
    public init(attachments: [NativeAttachment], chooseFile: @escaping () -> Void, choosePhoto: @escaping () -> Void) { self.attachments = attachments; self.chooseFile = chooseFile; self.choosePhoto = choosePhoto }
    public var body: some View { List { Section { Button("Choose File", systemImage: "doc", action: chooseFile); Button("Choose Photo or Camera", systemImage: "photo", action: choosePhoto) }; Section("Attachments") { ForEach(attachments) { attachment in HStack { Text(attachment.filename); Spacer(); Text(attachment.scanState.rawValue.capitalized) } } } }.navigationTitle("Files") }
}

public struct ReportsWorkspaceView: View {
    private let report: CompletedTaskReport
    private let export: () -> Void
    public init(report: CompletedTaskReport, export: @escaping () -> Void) { self.report = report; self.export = export }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                NaasehSectionHeader("Completed tasks", eyebrow: "Reports")
                VStack(spacing: NaasehSpacing.small) {
                    LabeledContent("Total credit", value: report.totalCredit.description)
                    ForEach(report.rows, id: \.id) { row in
                        Divider()
                        HStack {
                            Text(row.label).font(.headline)
                            Spacer()
                            Text(row.completedAt, style: .date).foregroundStyle(.secondary)
                        }
                    }
                }
                .naasehCard()
            }
            .padding()
            .frame(maxWidth: 1000)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .navigationTitle("Completed Tasks")
        .toolbar { Button("Export", systemImage: "square.and.arrow.up", action: export) }
    }
}
