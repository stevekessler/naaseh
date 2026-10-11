import SwiftUI

public struct CrisisPlanOwnerView: View {
    @Binding private var warningSigns: String
    @Binding private var copingStrategies: String
    private let save: () -> Void
    public init(warningSigns: Binding<String>, copingStrategies: Binding<String>, save: @escaping () -> Void) {
        _warningSigns = warningSigns; _copingStrategies = copingStrategies; self.save = save
    }
    public var body: some View {
        Form {
            Section("Warning Signs") { TextEditor(text: $warningSigns).privacySensitive() }
            Section("Things I Can Do") { TextEditor(text: $copingStrategies).privacySensitive() }
            Button("Save Encrypted Crisis Plan", action: save)
            Text("Na’aseh does not contact emergency services or provide clinical advice.").font(.footnote)
        }.navigationTitle("My Crisis Plan")
    }
}

public struct SharedCrisisPlanView: View {
    private let bodyValue: CrisisPlanBody?
    private let isOnline: Bool
    public init(body: CrisisPlanBody?, isOnline: Bool) { bodyValue = body; self.isOnline = isOnline }
    public var body: some View {
        Group {
            if !isOnline { ContentUnavailableView("Connect to View", systemImage: "wifi.slash", description: Text("Shared Crisis Plans are never stored for offline use.")) }
            else if let bodyValue { List { Section("Warning Signs") { ForEach(bodyValue.warningSigns, id: \.self, content: Text.init) }; Section("Coping Strategies") { ForEach(bodyValue.copingStrategies, id: \.self, content: Text.init) } }.privacySensitive() }
            else { ContentUnavailableView("Plan Unavailable", systemImage: "lock.shield") }
        }.navigationTitle("Shared Crisis Plan")
    }
}
