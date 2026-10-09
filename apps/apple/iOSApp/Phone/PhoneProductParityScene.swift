import NaasehFeatures
import SwiftUI

struct PhoneProductParityScene: View {
    let section: AppSection

    @ViewBuilder
    var body: some View {
        switch section {
        case .lists:
            ListsWorkspaceView(lists: [], selection: .constant(nil))
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
