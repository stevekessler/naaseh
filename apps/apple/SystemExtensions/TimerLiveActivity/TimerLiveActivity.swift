#if os(iOS)
import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

struct NaasehTimerAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let phase: String
        let endDate: Date?
        let pausedRemainingSeconds: Int?
        let isLocked: Bool
    }
    let timerID: String
}

struct TimerActionIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Control Na’aseh Timer"
    @Parameter(title: "Action") var action: String

    init() {}

    init(action: String) {
        self.action = action
    }

    func perform() async throws -> some IntentResult {
        // The app-group command receipt is consumed by the authenticated timer actor.
        .result()
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
                Button(intent: TimerActionIntent(action: "toggle")) {
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
                    Button(intent: TimerActionIntent(action: "toggle")) { Image(systemName: "pause.fill") }
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
        if let endDate = state.endDate {
            Text(timerInterval: Date() ... endDate, countsDown: true).monospacedDigit()
        } else {
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
