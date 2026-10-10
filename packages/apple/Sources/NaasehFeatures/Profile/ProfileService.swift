import Foundation

public struct PersonalProfile: Codable, Equatable, Sendable { public var displayName: String; public var email: String; public var timeZoneIdentifier: String; public init(displayName: String, email: String, timeZoneIdentifier: String = TimeZone.current.identifier) { self.displayName = displayName; self.email = email; self.timeZoneIdentifier = timeZoneIdentifier } }
public struct DevicePreferences: Codable, Equatable, Sendable { public var alertsEnabled: Bool; public var soundsEnabled: Bool; public var privatePreviewsEnabled: Bool; public init(alertsEnabled: Bool = true, soundsEnabled: Bool = true, privatePreviewsEnabled: Bool = false) { self.alertsEnabled = alertsEnabled; self.soundsEnabled = soundsEnabled; self.privatePreviewsEnabled = privatePreviewsEnabled } }
public struct AccountSecurityStatus: Codable, Equatable, Sendable { public var tfaEnabled: Bool; public var rememberedDevices: [String]; public var activeSessionCount: Int; public init(tfaEnabled: Bool, rememberedDevices: [String], activeSessionCount: Int) { self.tfaEnabled = tfaEnabled; self.rememberedDevices = rememberedDevices; self.activeSessionCount = activeSessionCount } }
public protocol ProfileTransport: Sendable { func saveProfile(_ profile: PersonalProfile) async throws -> PersonalProfile; func securityStatus() async throws -> AccountSecurityStatus; func changePassword(current: String, replacement: String) async throws; func setTFA(enabled: Bool, code: String) async throws; func forgetDevice(id: String) async throws; func revokeSession(id: String) async throws }
public enum ProfileError: Error, Equatable, Sendable { case offline, invalidProfile, invalidPassword, noChange }

public actor ProfileService {
    private let transport: any ProfileTransport
    private var profile: PersonalProfile
    public private(set) var devicePreferences: DevicePreferences
    public init(profile: PersonalProfile, devicePreferences: DevicePreferences = .init(), transport: any ProfileTransport) { self.profile = profile; self.devicePreferences = devicePreferences; self.transport = transport }
    public func currentProfile() -> PersonalProfile { profile }
    public func updateProfile(_ value: PersonalProfile, online: Bool) async throws -> PersonalProfile { guard online else { throw ProfileError.offline }; guard !value.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, value.email.contains("@"), TimeZone(identifier: value.timeZoneIdentifier) != nil else { throw ProfileError.invalidProfile }; guard value != profile else { throw ProfileError.noChange }; profile = try await transport.saveProfile(value); return profile }
    public func updateDevicePreferences(_ value: DevicePreferences) { devicePreferences = value }
    public func securityStatus(online: Bool) async throws -> AccountSecurityStatus { guard online else { throw ProfileError.offline }; return try await transport.securityStatus() }
    public func changePassword(current: String, replacement: String, confirmation: String, online: Bool) async throws { guard online else { throw ProfileError.offline }; guard replacement == confirmation, replacement.count >= 12, replacement != current else { throw ProfileError.invalidPassword }; try await transport.changePassword(current: current, replacement: replacement) }
    public func setTFA(enabled: Bool, code: String, online: Bool) async throws { guard online else { throw ProfileError.offline }; guard code.count >= 6 else { throw ProfileError.invalidPassword }; try await transport.setTFA(enabled: enabled, code: code) }
    public func forgetRememberedDevice(id: String, online: Bool) async throws { guard online else { throw ProfileError.offline }; try await transport.forgetDevice(id: id) }
    public func revokeSession(id: String, online: Bool) async throws { guard online else { throw ProfileError.offline }; try await transport.revokeSession(id: id) }
}
