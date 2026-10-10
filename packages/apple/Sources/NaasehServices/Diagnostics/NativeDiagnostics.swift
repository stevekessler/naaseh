import Foundation

public enum NativePlatform: String, Codable, Sendable {
    case ios, ipados, macos
}

public enum NativeOperationClass: String, Codable, Sendable {
    case migration, secureStore, crypto, sync, lifecycle, siri, notification, fileWorkflow
    case authentication
}

public enum NativeDiagnosticOutcome: String, Codable, Sendable {
    case failed, blocked, recovered, retryScheduled
}

public enum NativeErrorClass: String, Codable, Sendable {
    case validation, authorization, storageUnavailable, storageCorrupt, missingKey, decryptionFailed
    case migrationFailed, networkUnavailable, dependencyFailed, incompatibleClient, cancelled, unknown
}

public enum QueueDepthBucket: String, Codable, Sendable {
    case zero, oneToTen, elevenToHundred, overHundred
}

public enum FreshnessBucket: String, Codable, Sendable {
    case fresh, underHour, underDay, older, unknown
}

public struct NativeDiagnosticEvent: Codable, Equatable, Sendable, Identifiable {
    public let eventId: UUID
    public let occurredAt: Date
    public let platform: NativePlatform
    public let appVersion: String
    public let buildNumber: Int
    public let contractVersion: Int
    public let operationClass: NativeOperationClass
    public let outcome: NativeDiagnosticOutcome
    public let errorClass: NativeErrorClass
    public let durationMilliseconds: Int?
    public let retryable: Bool
    public let queueDepthBucket: QueueDepthBucket?
    public let freshnessBucket: FreshnessBucket?
    public let correlationId: UUID

    public var id: UUID { eventId }

    public init(
        eventId: UUID,
        occurredAt: Date,
        platform: NativePlatform,
        appVersion: String,
        buildNumber: Int,
        contractVersion: Int,
        operationClass: NativeOperationClass,
        outcome: NativeDiagnosticOutcome,
        errorClass: NativeErrorClass,
        durationMilliseconds: Int? = nil,
        retryable: Bool,
        queueDepthBucket: QueueDepthBucket? = nil,
        freshnessBucket: FreshnessBucket? = nil,
        correlationId: UUID
    ) {
        self.eventId = eventId
        self.occurredAt = occurredAt
        self.platform = platform
        self.appVersion = String(appVersion.prefix(40))
        self.buildNumber = max(1, buildNumber)
        self.contractVersion = max(1, contractVersion)
        self.operationClass = operationClass
        self.outcome = outcome
        self.errorClass = errorClass
        self.durationMilliseconds = durationMilliseconds.map { min(max(0, $0), 3_600_000) }
        self.retryable = retryable
        self.queueDepthBucket = queueDepthBucket
        self.freshnessBucket = freshnessBucket
        self.correlationId = correlationId
    }
}

public struct NativeActionableError: Error, Equatable, Sendable {
    public let code: NativeErrorClass
    public let title: String
    public let recoverySuggestion: String
    public let workState: WorkSafetyState
    public let correlationId: UUID

    public init(
        code: NativeErrorClass,
        title: String,
        recoverySuggestion: String,
        workState: WorkSafetyState,
        correlationId: UUID = UUID()
    ) {
        self.code = code
        self.title = title
        self.recoverySuggestion = recoverySuggestion
        self.workState = workState
        self.correlationId = correlationId
    }
}

public enum WorkSafetyState: String, Codable, Sendable {
    case savedLocally, pending, unchanged, blocked, unknown
}

public enum NativeDiagnostics {
    public static func queueDepth(_ count: Int) -> QueueDepthBucket {
        return switch count {
        case ...0: .zero
        case 1 ... 10: .oneToTen
        case 11 ... 100: .elevenToHundred
        default: .overHundred
        }
    }

    public static func freshness(age: TimeInterval?) -> FreshnessBucket {
        guard let age else { return .unknown }
        return switch age {
        case ..<300: .fresh
        case ..<3600: .underHour
        case ..<86400: .underDay
        default: .older
        }
    }
}
