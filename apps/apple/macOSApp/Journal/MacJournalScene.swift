import NaasehFeatures
import SwiftUI

struct MacJournalScene: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedID: String?
    @State private var date = ""
    @State private var notes = ""
    var body: some View {
        NavigationSplitView {
            JournalBrowserView(entries: [], selectedID: $selectedID)
        } detail: {
            JournalEditorView(date: $date, notes: $notes, triggerPlan: {}, save: {})
        }
        .redacted(reason: scenePhase == .active ? [] : .placeholder)
        .onChange(of: scenePhase) { _, phase in if phase != .active { notes = ""; selectedID = nil } }
    }
}
