import SwiftUI

public enum NaasehDesignSystemModule {
    public static let minimumTouchTarget: CGFloat = 44
}

public enum NaasehSpacing {
    public static let compact: CGFloat = 8
    public static let small: CGFloat = 12
    public static let standard: CGFloat = 16
    public static let spacious: CGFloat = 24
}

public enum NaasehPalette {
    // Keep these values aligned with apps/web/src/styles/app.css.
    public static let navy = Color(red: 6 / 255, green: 54 / 255, blue: 107 / 255)
    public static let green = Color(red: 54 / 255, green: 168 / 255, blue: 63 / 255)
    public static let ink = Color(red: 16 / 255, green: 43 / 255, blue: 73 / 255)
    public static let mutedInk = Color(red: 82 / 255, green: 99 / 255, blue: 89 / 255)
    public static let canvas = Color(red: 244 / 255, green: 247 / 255, blue: 244 / 255)
    public static let line = Color(red: 216 / 255, green: 226 / 255, blue: 220 / 255)
    public static let secondarySurface = Color(red: 238 / 255, green: 243 / 255, blue: 239 / 255)
    public static let accent = navy
    public static let success = green
    public static let warning = Color(red: 154 / 255, green: 91 / 255, blue: 16 / 255)
    public static let danger = Color(red: 154 / 255, green: 36 / 255, blue: 36 / 255)
}

public struct NaasehCardModifier: ViewModifier {
    private let padding: CGFloat

    public init(padding: CGFloat = NaasehSpacing.standard) { self.padding = padding }

    public func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(.background, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(NaasehPalette.line, lineWidth: 1)
            }
    }
}

public struct NaasehSectionHeader: View {
    private let eyebrow: String?
    private let title: String
    private let detail: String?

    public init(
        _ title: String,
        eyebrow: String? = nil,
        detail: String? = nil
    ) {
        self.title = title
        self.eyebrow = eyebrow
        self.detail = detail
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let eyebrow {
                Text(eyebrow)
                    .font(.caption.weight(.heavy))
                    .textCase(.uppercase)
                    .tracking(1.5)
                    .foregroundStyle(NaasehPalette.green)
            }
            Text(title)
                .font(.largeTitle.bold())
                .foregroundStyle(NaasehPalette.ink)
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(NaasehPalette.mutedInk)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

public struct NaasehBrandHeader: View {
    public init() {}

    public var body: some View {
        HStack(spacing: NaasehSpacing.small) {
            Image("NaasehLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 46, height: 46)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("Na’aseh")
                    .font(.title2.bold())
                    .foregroundStyle(NaasehPalette.navy)
                Text("We will do it")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NaasehPalette.green)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Na’aseh — We will do it")
    }
}

public struct NaasehPrimaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: NaasehDesignSystemModule.minimumTouchTarget)
            .padding(.horizontal, NaasehSpacing.standard)
            .foregroundStyle(.white)
            .background(NaasehPalette.accent.opacity(configuration.isPressed ? 0.75 : 1))
            .clipShape(.rect(cornerRadius: 12))
            .contentShape(.rect)
    }
}

public struct NaasehSecondaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(minHeight: NaasehDesignSystemModule.minimumTouchTarget)
            .padding(.horizontal, NaasehSpacing.standard)
            .foregroundStyle(NaasehPalette.accent)
            .background(NaasehPalette.secondarySurface.opacity(configuration.isPressed ? 0.7 : 1))
            .clipShape(.rect(cornerRadius: 12))
            .contentShape(.rect)
    }
}

public enum StatusBannerKind: Sendable {
    case information, success, warning, error

    var color: Color {
        switch self {
        case .information: NaasehPalette.accent
        case .success: NaasehPalette.success
        case .warning: NaasehPalette.warning
        case .error: NaasehPalette.danger
        }
    }

    var symbol: String {
        switch self {
        case .information: "info.circle.fill"
        case .success: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .error: "xmark.octagon.fill"
        }
    }
}

public struct StatusBanner: View {
    private let kind: StatusBannerKind
    private let title: LocalizedStringKey
    private let detail: LocalizedStringKey?

    public init(
        kind: StatusBannerKind,
        title: LocalizedStringKey,
        detail: LocalizedStringKey? = nil
    ) {
        self.kind = kind
        self.title = title
        self.detail = detail
    }

    public var body: some View {
        HStack(alignment: .top, spacing: NaasehSpacing.compact) {
            Image(systemName: kind.symbol)
                .foregroundStyle(kind.color)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                if let detail { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 0)
        }
        .padding(NaasehSpacing.standard)
        .background(kind.color.opacity(0.12), in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

public struct NaasehLoadingState: View {
    private let label: LocalizedStringKey

    public init(_ label: LocalizedStringKey = "Loading…") { self.label = label }

    public var body: some View {
        ContentUnavailableView { Label(label, systemImage: "hourglass") }
            .accessibilityAddTraits(.updatesFrequently)
    }
}

public struct NaasehEmptyState: View {
    private let title: LocalizedStringKey
    private let symbol: String
    private let detail: LocalizedStringKey

    public init(
        _ title: LocalizedStringKey,
        symbol: String = "tray",
        detail: LocalizedStringKey
    ) {
        self.title = title
        self.symbol = symbol
        self.detail = detail
    }

    public var body: some View {
        ContentUnavailableView(title, systemImage: symbol, description: Text(detail))
    }
}

public struct NaasehErrorState: View {
    private let title: LocalizedStringKey
    private let detail: LocalizedStringKey
    private let correlationID: String?
    private let retry: (() -> Void)?

    public init(
        _ title: LocalizedStringKey = "Unable to Continue",
        detail: LocalizedStringKey,
        correlationID: String? = nil,
        retry: (() -> Void)? = nil
    ) {
        self.title = title
        self.detail = detail
        self.correlationID = correlationID
        self.retry = retry
    }

    public var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: "exclamationmark.triangle")
        } description: {
            VStack(spacing: NaasehSpacing.compact) {
                Text(detail)
                if let correlationID {
                    Text("Reference: \(correlationID)")
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                }
            }
        } actions: {
            if let retry { Button("Try Again", action: retry).buttonStyle(NaasehPrimaryButtonStyle()) }
        }
    }
}

public extension View {
    func naasehCard(padding: CGFloat = NaasehSpacing.standard) -> some View {
        modifier(NaasehCardModifier(padding: padding))
    }

    func naasehWorkspaceBackground() -> some View {
        background(NaasehPalette.canvas.ignoresSafeArea())
            .foregroundStyle(NaasehPalette.ink)
            .tint(NaasehPalette.navy)
    }

    func naasehField() -> some View {
        padding(.horizontal, 12)
            .frame(minHeight: NaasehDesignSystemModule.minimumTouchTarget)
            .background(.background, in: .rect(cornerRadius: 10))
            .overlay {
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color(red: 175 / 255, green: 190 / 255, blue: 181 / 255), lineWidth: 1)
            }
    }

    func naasehAccessibleTarget() -> some View {
        frame(
            minWidth: NaasehDesignSystemModule.minimumTouchTarget,
            minHeight: NaasehDesignSystemModule.minimumTouchTarget
        )
        .contentShape(.rect)
    }

    func naasehSensitive() -> some View {
        privacySensitive()
    }
}
