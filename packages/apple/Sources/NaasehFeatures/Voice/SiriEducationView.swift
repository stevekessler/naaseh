import SwiftUI

public enum SiriAvailability: Equatable, Sendable { case available, disabled, unavailable }

public struct SiriEducationView: View {
    private let availability: SiriAvailability
    private let createFallback: () -> Void

    public init(availability: SiriAvailability, createFallback: @escaping () -> Void) {
        self.availability = availability; self.createFallback = createFallback
    }

    public var body: some View {
        Form {
            Section("Create Tasks with Siri") {
                Text("Say “Hey Siri, use Na’aseh to add Call the dentist tomorrow at 9 AM.”")
                Text("You can also say GSD. Leave out the project to create an unassigned task, or name an existing project.")
                Label(status, systemImage: symbol)
            }
            Section("Privacy") {
                Text("Na’aseh does not donate task names, project names, memo text, or journal content to Spotlight.")
            }
            Button("Create a Task in Na’aseh", action: createFallback)
        }
        .navigationTitle("Siri")
    }

    private var status: String {
        switch availability { case .available: "Siri is available"; case .disabled: "Enable Siri in System Settings"; case .unavailable: "Siri is unavailable on this device" }
    }
    private var symbol: String { availability == .available ? "checkmark.circle" : "exclamationmark.triangle" }
}
