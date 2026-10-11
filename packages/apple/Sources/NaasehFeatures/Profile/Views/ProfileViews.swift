import NaasehDesignSystem
import SwiftUI

public struct ProfilePhotoSettingsView: View {
    private let choosePhoto: () -> Void

    public init(choosePhoto: @escaping () -> Void) { self.choosePhoto = choosePhoto }

    public var body: some View {
        VStack(spacing: NaasehSpacing.standard) {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(NaasehPalette.navy)
                .accessibilityLabel("Current profile photo")
            Button("Choose profile photo", action: choosePhoto)
                .buttonStyle(NaasehSecondaryButtonStyle())
        }
        .frame(maxWidth: .infinity)
    }
}

public struct ReminderAndSoundSettingsView: View {
    private let enableReminders: () -> Void
    @Binding private var sounds: Bool

    public init(sounds: Binding<Bool>, enableReminders: @escaping () -> Void) {
        _sounds = sounds
        self.enableReminders = enableReminders
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
            Button("Enable reminders", action: enableReminders)
                .buttonStyle(NaasehSecondaryButtonStyle())
            Toggle("Completion sounds", isOn: $sounds)
                .tint(NaasehPalette.green)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

public struct SecuritySettingsView: View {
    @Binding private var currentPassword: String
    @Binding private var newPassword: String
    @Binding private var confirmation: String
    @Binding private var factorCode: String
    private let changePassword: () -> Void
    private let updateTFA: () -> Void
    private let embedded: Bool
    public init(currentPassword: Binding<String>, newPassword: Binding<String>, confirmation: Binding<String>, factorCode: Binding<String>, embedded: Bool = false, changePassword: @escaping () -> Void, updateTFA: @escaping () -> Void) { _currentPassword = currentPassword; _newPassword = newPassword; _confirmation = confirmation; _factorCode = factorCode; self.embedded = embedded; self.changePassword = changePassword; self.updateTFA = updateTFA }
    @ViewBuilder
    public var body: some View {
        if embedded {
            securityCards
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                    NaasehSectionHeader("Account security", eyebrow: "Your profile")
                    securityCards
                }
                .padding()
                .frame(maxWidth: 832)
                .frame(maxWidth: .infinity)
            }
            .naasehWorkspaceBackground()
            .navigationTitle("Account security")
        }
    }

    private var securityCards: some View {
        VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
            VStack(alignment: .leading, spacing: NaasehSpacing.small) {
                Text("Change password").font(.headline).foregroundStyle(NaasehPalette.navy)
                SecureField("Current password", text: $currentPassword).textContentType(.password).naasehField()
                SecureField("New password", text: $newPassword).textContentType(.newPassword).naasehField()
                SecureField("Confirm new password", text: $confirmation).textContentType(.newPassword).naasehField()
                Button("Change password", action: changePassword).buttonStyle(NaasehPrimaryButtonStyle())
            }
            .naasehCard()
            VStack(alignment: .leading, spacing: NaasehSpacing.small) {
                Text("Two-factor authentication").font(.headline).foregroundStyle(NaasehPalette.navy)
                TextField("Authentication code", text: $factorCode).textContentType(.oneTimeCode).naasehField()
                Button("Update two-factor authentication", action: updateTFA)
                    .buttonStyle(NaasehSecondaryButtonStyle())
            }
            .naasehCard()
        }
    }
}
