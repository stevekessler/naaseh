import NaasehFeatures
import SwiftUI

struct PadProductParityScene: View {
    let section: AppSection
    @State private var selectedList: String?

    @ViewBuilder
    var body: some View {
        switch section {
        case .lists:
            ListsWorkspaceView(lists: [], selection: $selectedList)
        case .directory:
            ContentUnavailableView(
                "Directory",
                systemImage: "person.2",
                description: Text("Directory entries will appear here when they are available.")
            )
        case .reports:
            ReportsWorkspaceView(report: .init(rows: [], totalCredit: 0), export: {})
        default:
            EmptyView()
        }
    }
}
