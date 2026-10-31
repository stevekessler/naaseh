#if os(iOS)
import ActivityKit
import NaasehContracts
import AppIntents
import SwiftUI
import WidgetKit

struct TimerActionIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Control Na’aseh Timer"
    static let openAppWhenRun = true
    @Parameter(title: "Action") var action: String
    @Parameter(title: "Timer") var timerID: String

    init() {}

    init(action: String, timerID: String) {
        self.action = action
        self.timerID = timerID
    }

    func perform() async throws -> some IntentResult & OpensIntent {
        let url = URL(string: "naaseh://timer?action=\(action)&run=\(timerID)")!
        return .result(opensIntent: OpenURLIntent(url))
    }
}

struct TimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NaasehTimerAttributes.self) { context in
            HStack {
                Image(systemName: "timer")
                if context.state.isLocked {
                    Text("Timer active")
                } else {
                    Text(context.state.phase.capitalized)
                    Spacer()
                    timerText(context.state)
                }
                Button(intent: TimerActionIntent(action: "toggle", timerID: context.attributes.timerID)) {
                    Image(systemName: context.state.endDate == nil ? "play.fill" : "pause.fill")
                }
                .accessibilityLabel(context.state.endDate == nil ? "Resume timer" : "Pause timer")
            }
            .padding()
            .privacySensitive()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Image(systemName: "timer") }
                DynamicIslandExpandedRegion(.center) {
                    if context.state.isLocked {
                        Text("Timer active")
                    } else {
                        timerText(context.state)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Button(intent: TimerActionIntent(action: "toggle", timerID: context.attributes.timerID)) { Image(systemName: "pause.fill") }
                        .accessibilityLabel(context.state.endDate == nil ? "Resume timer" : "Pause timer")
                }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                if context.state.isLocked {
                    Text("On")
                } else {
                    timerText(context.state)
                }
            } minimal: {
                Image(systemName: "timer")
            }
            .keylineTint(.accentColor)
        }
    }

    @ViewBuilder private func timerText(_ state: NaasehTimerAttributes.ContentState) -> some View {
        if let endDate = state.endDate, endDate > Date() {
            Text(timerInterval: Date() ... endDate, countsDown: true).monospacedDigit()
        } else if state.endDate != nil { Text("Interval finished") }
        else {
            Text(Duration.seconds(state.pausedRemainingSeconds ?? 0).formatted(.time(pattern: .minuteSecond)))
                .monospacedDigit()
        }
    }
}

@main
struct NaasehTimerActivityBundle: WidgetBundle {
    var body: some Widget {
        TimerLiveActivity()
    }
}
#endif
