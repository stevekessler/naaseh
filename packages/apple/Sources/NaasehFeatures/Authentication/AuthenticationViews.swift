import NaasehDesignSystem
import NaasehServices
import Observation
import SwiftUI

@MainActor
@Observable
public final class AuthenticationViewModel {
    public enum Step: Equatable { case signIn, tfa, enrollment, recovery, authenticated, locked }

    public var step: Step = .signIn
    public var username = ""
    public var password = ""
    public var factorCode = ""
    public var rememberDevice = true
    public var enrollment: TFAEnrollment?
    public var isWorking = false
    public var error: AuthenticationError?
    public var correlationID: String?

    private let service: AuthenticationService
    public var onAuthenticated: (@MainActor () async -> Void)?

    public init(service: AuthenticationService) { self.service = service }

    public func signIn() async {
        await perform {
            switch try await service.login(username: username, password: password) {
            case .authenticated:
                step = .authenticated
                await onAuthenticated?()
            case .tfaChallenge: step = .tfa
            case .tfaEnrollment:
                enrollment = try await service.startEnrollment()
                step = .enrollment
            }
        }
    }

    public func submitFactor(method: NativeFactorMethod = .totp) async {
        await perform {
            _ = try await service.completeChallenge(
                method: method,
                code: factorCode,
                rememberDevice: rememberDevice
            )
            factorCode = ""
            step = .authenticated
            await onAuthenticated?()
        }
    }

    public func confirmEnrollment() async {
        await perform {
            _ = try await service.confirmEnrollment(code: factorCode, rememberDevice: rememberDevice)
            factorCode = ""
            step = .authenticated
            await onAuthenticated?()
        }
    }

    public func lock() async {
        await service.lockLocally()
        step = .locked
    }

    public func unlock() async {
        await perform {
            _ = try await service.validateSession()
            try await service.unlockLocally()
            step = .authenticated
            await onAuthenticated?()
        }
    }

    private func perform(_ operation: () async throws -> Void) async {
        isWorking = true
        error = nil
        correlationID = nil
        defer { isWorking = false }
        do { try await operation() }
        catch let failure as AuthenticationError {
            error = failure
            if case let .server(_, reference) = failure { correlationID = reference }
        } catch {
            self.error = .malformedResponse
        }
    }
}

public struct AuthenticationRootView: View {
    @Bindable private var model: AuthenticationViewModel

    public init(model: AuthenticationViewModel) { self.model = model }

    public var body: some View {
        ZStack {
            NaasehPalette.canvas.ignoresSafeArea()
            VStack(spacing: NaasehSpacing.spacious) {
                NaasehBrandHeader()
                VStack(spacing: NaasehSpacing.standard) {
                    switch model.step {
                    case .signIn: signIn
                    case .tfa: factor(title: "Two-Factor Authentication", enrollment: false)
                    case .enrollment: factor(title: "Set Up Two-Factor Authentication", enrollment: true)
                    case .recovery: recovery
                    case .authenticated: NaasehLoadingState("Opening your work…")
                    case .locked: locked
                    }
                    if let error = model.error {
                        NaasehErrorState(
                            "Sign-In Problem",
                            detail: error.safeMessage,
                            correlationID: model.correlationID
                        )
                    }
                }
                .naasehCard(padding: NaasehSpacing.spacious)
            }
            .padding()
            .frame(maxWidth: 460)
        }
        .accessibilityIdentifier("authentication.\(model.step)")
    }

    private var signIn: some View {
        VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
            Text("Sign in").font(.title.bold()).foregroundStyle(NaasehPalette.navy)
            Text("Username").font(.headline)
            TextField("Username", text: $model.username)
                .textContentType(.username)
                .naasehField()
                .accessibilityIdentifier("authentication.username")
            Text("Password").font(.headline)
            SecureField("Password", text: $model.password)
                .textContentType(.password)
                .naasehField()
                .accessibilityIdentifier("authentication.password")
            Button("Sign In") { Task { await model.signIn() } }
                .buttonStyle(NaasehPrimaryButtonStyle())
                .disabled(model.isWorking || model.username.isEmpty || model.password.isEmpty)
                .accessibilityIdentifier("authentication.submit")
        }
    }

    private func factor(title: LocalizedStringKey, enrollment: Bool) -> some View {
        VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
            Text(title).font(.title2.bold())
            if enrollment, let value = model.enrollment {
                Text("Add this account to your authenticator, then enter its six-digit code.")
                Text(value.secret).font(.body.monospaced()).textSelection(.enabled).privacySensitive()
            }
            TextField("Verification code", text: $model.factorCode)
                .textContentType(.oneTimeCode)
                .naasehField()
                .accessibilityIdentifier("authentication.factorCode")
            Toggle("Remember this device", isOn: $model.rememberDevice)
            Button(enrollment ? "Finish Setup" : "Verify") {
                Task { enrollment ? await model.confirmEnrollment() : await model.submitFactor() }
            }
            .buttonStyle(NaasehPrimaryButtonStyle())
            Button("Use a recovery code") { model.step = .recovery }
                .buttonStyle(NaasehSecondaryButtonStyle())
        }
    }

    private var recovery: some View {
        VStack(spacing: NaasehSpacing.standard) {
            Text("Recovery Code").font(.title2.bold())
            SecureField("Recovery code", text: $model.factorCode).textContentType(.oneTimeCode).naasehField()
            Button("Verify Recovery Code") {
                Task { await model.submitFactor(method: .recoveryCode) }
            }
            .buttonStyle(NaasehPrimaryButtonStyle())
        }
    }

    private var locked: some View {
        ContentUnavailableView {
            Label("Na’aseh Is Locked", systemImage: "lock.shield")
        } description: {
            Text("Unlock with your device authentication to continue.")
        } actions: {
            Button("Unlock") { Task { await model.unlock() } }
                .buttonStyle(NaasehPrimaryButtonStyle())
                .accessibilityIdentifier("authentication.unlock")
        }
    }
}

private extension AuthenticationError {
    var safeMessage: LocalizedStringKey {
        switch self {
        case .accountDisabled: "This account is disabled. Contact an administrator."
        case .sessionExpired: "Your session expired. Sign in again."
        case .authenticationFailed: "The credentials or verification code were not accepted."
        case .redirectRejected: "The server returned an unsafe redirect."
        case .missingPreAuthentication: "The sign-in challenge expired. Start again."
        case .noSession: "Sign in again to continue."
        case .malformedResponse: "The server response could not be verified."
        case .server: "The request could not be completed."
        }
    }
}
