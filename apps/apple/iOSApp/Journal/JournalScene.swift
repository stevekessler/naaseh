import NaasehFeatures
import SwiftUI

struct JournalScene: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var date = ""
    @State private var notes = ""
    @State private var showingPlan = false
    var body: some View {
        NavigationStack {
            JournalEditorView(date: $date, notes: $notes, triggerPlan: { showingPlan = true }, save: {})
                .sheet(isPresented: $showingPlan) { NavigationStack { JournalCrisisDraftView() } }
        }
        .redacted(reason: scenePhase == .active ? [] : .placeholder)
        .onChange(of: scenePhase) { _, phase in if phase != .active { notes = "" } }
    }
}

private struct JournalCrisisDraftView: View {
    @State private var warning = ""
    @State private var coping = ""
    var body: some View { CrisisPlanOwnerView(warningSigns: $warning, copingStrategies: $coping, save: {}) }
}
