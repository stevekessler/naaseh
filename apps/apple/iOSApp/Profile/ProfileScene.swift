import NaasehDesignSystem
import NaasehFeatures
import PhotosUI
import SwiftUI
import UIKit

struct ProfileScene: View {
    @Environment(\.openURL) private var openURL
    @State private var current = ""
    @State private var replacement = ""
    @State private var confirmation = ""
    @State private var code = ""
    @State private var sounds = true
    @State private var showingPhotoPicker = false
    @State private var photoItem: PhotosPickerItem?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                NaasehSectionHeader("Your profile", eyebrow: "Account")
                profileLink("Profile photo", symbol: "person.crop.circle") {
                    ProfilePhotoSettingsView { showingPhotoPicker = true }
                        .padding()
                        .navigationTitle("Profile photo")
                        .naasehWorkspaceBackground()
                }
                profileLink("Reminders and sounds", symbol: "bell") {
                    ScrollView {
                        VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                            NaasehSectionHeader("Reminders and sounds", eyebrow: "Your profile")
                            ReminderAndSoundSettingsView(sounds: $sounds) {
                                if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                                    openURL(url)
                                }
                            }
                            .naasehCard()
                        }
                        .padding()
                    }
                    .naasehWorkspaceBackground()
                }
                profileLink("Account security", symbol: "lock.shield") {
                    SecuritySettingsView(
                        currentPassword: $current,
                        newPassword: $replacement,
                        confirmation: $confirmation,
                        factorCode: $code,
                        changePassword: {},
                        updateTFA: {}
                    )
                }
            }
            .padding()
            .frame(maxWidth: 832)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .navigationTitle("Your profile")
        .photosPicker(isPresented: $showingPhotoPicker, selection: $photoItem, matching: .images)
    }

    private func profileLink<Destination: View>(
        _ title: LocalizedStringKey,
        symbol: String,
        @ViewBuilder destination: () -> Destination
    ) -> some View {
        NavigationLink(destination: destination) {
            HStack(spacing: NaasehSpacing.small) {
                Image(systemName: symbol)
                    .frame(width: 28)
                    .foregroundStyle(NaasehPalette.green)
                Text(title).font(.headline).foregroundStyle(NaasehPalette.navy)
                Spacer()
                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.secondary)
            }
            .naasehCard()
        }
        .buttonStyle(.plain)
    }
}
