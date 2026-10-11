import NaasehDesignSystem
import SwiftUI

public struct JournalSetupView: View {
    @Binding private var pin: String
    private let configure: () -> Void
    public init(pin: Binding<String>, configure: @escaping () -> Void) { _pin = pin; self.configure = configure }
    public var body: some View {
        Form {
            SecureField("Journal PIN", text: $pin).textContentType(.newPassword).privacySensitive()
            Text("Your journal is end-to-end encrypted. Keep your PIN private.").foregroundStyle(.secondary)
            Button("Secure My Journal", action: configure).disabled(pin.count < 6)
        }.navigationTitle("Set Up Journal")
    }
}

public struct JournalUnlockView: View {
    @Binding private var pin: String
    private let unlock: () -> Void
    public init(pin: Binding<String>, unlock: @escaping () -> Void) { _pin = pin; self.unlock = unlock }
    public var body: some View {
        Form {
            SecureField("Journal PIN", text: $pin).textContentType(.password).privacySensitive()
            Button("Unlock", action: unlock).disabled(pin.isEmpty)
            Text("Journal content locks when Na’aseh moves to the background.").font(.footnote)
        }.navigationTitle("Unlock Journal")
    }
}

public struct JournalBrowserView: View {
    private let entries: [JournalEntry]
    @Binding private var selectedID: String?
    public init(entries: [JournalEntry], selectedID: Binding<String?>) { self.entries = entries; _selectedID = selectedID }
    public var body: some View {
        List {
            ForEach(entries) { entry in
                Button {
                    selectedID = entry.id
                } label: {
                    VStack(alignment: .leading) {
                        Text(entry.projection.date).font(.headline)
                        Text(entry.pendingSync ? "Pending secure sync" : "Synced").font(.caption).foregroundStyle(.secondary)
                    }
                }.privacySensitive()
            }
        }.navigationTitle("Journal")
    }
}

public struct JournalEditorView: View {
    @Binding private var date: String
    @Binding private var notes: String
    private let triggerPlan: () -> Void
    private let save: () -> Void
    public init(date: Binding<String>, notes: Binding<String>, triggerPlan: @escaping () -> Void, save: @escaping () -> Void) {
        _date = date; _notes = notes; self.triggerPlan = triggerPlan; self.save = save
    }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                NaasehSectionHeader("Journal entry", eyebrow: "Journal")
                VStack(alignment: .leading, spacing: NaasehSpacing.small) {
                    Text("Date").font(.headline)
                    TextField("YYYY-MM-DD", text: $date).naasehField()
                    Text("Notes").font(.headline)
                    TextEditor(text: $notes)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 220)
                        .padding(10)
                        .background(.background, in: .rect(cornerRadius: 10))
                        .overlay { RoundedRectangle(cornerRadius: 10).stroke(NaasehPalette.line) }
                        .privacySensitive()
                        .accessibilityLabel("General journal notes")
                    HStack {
                        Button("Open Crisis Plan", systemImage: "heart.text.square", action: triggerPlan)
                            .buttonStyle(NaasehSecondaryButtonStyle())
                        Button("Save encrypted entry", action: save)
                            .buttonStyle(NaasehPrimaryButtonStyle())
                    }
                }
                .naasehCard()
            }
            .padding()
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .navigationTitle("Journal Entry")
    }
}

public struct JournalDashboardView: View {
    private let metrics: [JournalDashboardMetric]
    public init(metrics: [JournalDashboardMetric]) { self.metrics = metrics }
    public var body: some View {
        List(metrics) { metric in
            HStack { Text(metric.name); Spacer(); Text(label(metric.value)); Image(systemName: symbol(metric.trend)) }
                .privacySensitive()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(metric.name)
                .accessibilityValue("\(label(metric.value)), trend \(trendLabel(metric.trend))")
        }.navigationTitle("Journal Dashboard")
    }
    private func label(_ value: JournalDashboardValue) -> String { if case let .number(value) = value { return value.formatted() }; return "No data" }
    private func symbol(_ trend: JournalDashboardTrend) -> String { switch trend { case .up: "arrow.up"; case .down: "arrow.down"; case .unchanged: "equal"; case .notComparable: "minus" } }
    private func trendLabel(_ trend: JournalDashboardTrend) -> String { switch trend { case .up: "up"; case .down: "down"; case .unchanged: "unchanged"; case .notComparable: "not comparable" } }
}
