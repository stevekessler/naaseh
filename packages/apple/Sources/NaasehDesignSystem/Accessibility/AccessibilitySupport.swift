import SwiftUI

public enum NaasehAccessibilityStatus: String, Sendable { case success, warning, error, progress }
public struct AccessibleStatusLabel: View {
    private let title: LocalizedStringKey
    private let detail: LocalizedStringKey
    private let status: NaasehAccessibilityStatus
    public init(_ title: LocalizedStringKey, detail: LocalizedStringKey, status: NaasehAccessibilityStatus) { self.title = title; self.detail = detail; self.status = status }
    public var body: some View { Label { VStack(alignment: .leading) { Text(title).font(.headline); Text(detail).font(.caption) } } icon: { Image(systemName: symbol).accessibilityHidden(true) }.accessibilityElement(children: .combine).accessibilityLabel(Text(title)).accessibilityValue(Text(detail)).accessibilityAddTraits(status == .error ? .isStaticText : []) }
    private var symbol: String { switch status { case .success: "checkmark.circle"; case .warning: "exclamationmark.triangle"; case .error: "xmark.octagon"; case .progress: "arrow.triangle.2.circlepath" } }
}
public extension View {
    func naasehPrimaryAction(label: LocalizedStringKey, hint: LocalizedStringKey) -> some View { self.accessibilityLabel(Text(label)).accessibilityHint(Text(hint)).frame(minWidth: 44, minHeight: 44).contentShape(Rectangle()) }
    func naasehFocusOrder(_ priority: Double) -> some View { accessibilitySortPriority(priority) }
    func naasehStatusAnnouncement(_ value: String) -> some View { accessibilityValue(value).accessibilityAddTraits(.updatesFrequently) }
    func naasehNonColorMeaning(_ label: LocalizedStringKey, symbol: String) -> some View { accessibilityLabel(Text(label)).overlay(alignment: .trailing) { Image(systemName: symbol).accessibilityHidden(true) } }
}
