import NaasehDesignSystem
import NaasehFeatures
import SwiftUI
import UniformTypeIdentifiers

struct MacProfileScene: View {
    @Environment(\.openURL) private var openURL
    @State private var current = ""
    @State private var replacement = ""
    @State private var confirmation = ""
    @State private var code = ""
    @State private var sounds = true
    @State private var showingPhotoImporter = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NaasehSpacing.small) {
                NaasehSectionHeader("Your profile", eyebrow: "Account")
                    .padding(.bottom, NaasehSpacing.compact)
                profileSection("Profile photo") {
                    ProfilePhotoSettingsView { showingPhotoImporter = true }
                }
                profileSection("Reminders and sounds") {
                    ReminderAndSoundSettingsView(sounds: $sounds) {
                        if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") {
                            openURL(url)
                        }
                    }
                }
                profileSection("Account security") {
                    SecuritySettingsView(
                        currentPassword: $current,
                        newPassword: $replacement,
                        confirmation: $confirmation,
                        factorCode: $code,
                        embedded: true,
                        changePassword: {},
                        updateTFA: {}
                    )
                }
            }
            .padding(24)
            .frame(maxWidth: 832)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .navigationTitle("Your profile")
        .fileImporter(isPresented: $showingPhotoImporter, allowedContentTypes: [.image]) { _ in }
    }

    private func profileSection<Content: View>(
        _ title: LocalizedStringKey,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        DisclosureGroup {
            content().padding(.top, NaasehSpacing.standard)
        } label: {
            Text(title).font(.title3.bold()).foregroundStyle(NaasehPalette.navy)
        }
        .naasehCard()
    }
}
