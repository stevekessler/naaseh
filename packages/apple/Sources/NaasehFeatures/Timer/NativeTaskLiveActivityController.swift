import Foundation
#if os(iOS)
@preconcurrency import ActivityKit
import NaasehContracts
#endif

@MainActor public final class NativeTaskLiveActivityController {
    public static let shared = NativeTaskLiveActivityController()
    private init() {}
    public func update(_ timer: NativeAccountTaskTimer?, now: Date = Date()) async {
        #if os(iOS)
        guard UserDefaults.standard.bool(forKey: "naaseh.timer-live-activity"), ActivityAuthorizationInfo().areActivitiesEnabled,
              let timer, ["running", "paused"].contains(timer.effective(at: now).timer.status) else { await end(); return }
        let effective = timer.effective(at: now).timer
        let content = NaasehTimerAttributes.ContentState(phase: effective.status,
            endDate: NativeAccountTaskTimer.date(effective.endsAt).map { Date().addingTimeInterval($0.timeIntervalSince(now)) }, pausedRemainingSeconds: effective.pausedRemainingSeconds, isLocked: false)
        for activity in Activity<NaasehTimerAttributes>.activities where activity.attributes.timerID != timer.runId {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        if let activity = Activity<NaasehTimerAttributes>.activities.first(where: { $0.attributes.timerID == timer.runId }) {
            await activity.update(ActivityContent(state: content, staleDate: content.endDate))
        } else {
            _ = try? Activity.request(attributes: NaasehTimerAttributes(timerID: timer.runId), content: ActivityContent(state: content,
                staleDate: content.endDate), pushType: nil)
        }
        #endif
    }
    public func redact() async {
        #if os(iOS)
        for activity in Activity<NaasehTimerAttributes>.activities {
            let current = activity.content.state
            let state = NaasehTimerAttributes.ContentState(phase: current.phase, endDate: current.endDate,
                pausedRemainingSeconds: current.pausedRemainingSeconds, isLocked: true)
            await activity.update(ActivityContent(state: state, staleDate: current.endDate))
        }
        #endif
    }
    public func end() async {
        #if os(iOS)
        for activity in Activity<NaasehTimerAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
        #endif
    }
}
