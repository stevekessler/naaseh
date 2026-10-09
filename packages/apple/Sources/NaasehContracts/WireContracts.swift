import Foundation

public struct APIProblem: Codable, Equatable, Sendable, Error {
    public let type: String
    public let title: String
    public let status: Int
    public let code: String
    public let message: String
    public let correlationId: String

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case type, title, status, code, message, correlationId
    }

    public init(
        type: String,
        title: String,
        status: Int,
        code: String,
        message: String,
        correlationId: String
    ) throws {
        guard type.hasPrefix("urn:naaseh:problem:"), (400 ... 599).contains(status),
              !title.isEmpty, !code.isEmpty, !message.isEmpty, !correlationId.isEmpty
        else {
            throw WireContractError.invalidProblem
        }
        self.type = type
        self.title = title
        self.status = status
        self.code = code
        self.message = message
        self.correlationId = correlationId
    }

    public init(from decoder: Decoder) throws {
        try decoder.rejectUnknownKeys(allowed: CodingKeys.allCases.map(\.rawValue))
        let values = try decoder.container(keyedBy: CodingKeys.self)
        do {
            try self.init(
                type: values.decode(String.self, forKey: .type),
                title: values.decode(String.self, forKey: .title),
                status: values.decode(Int.self, forKey: .status),
                code: values.decode(String.self, forKey: .code),
                message: values.decode(String.self, forKey: .message),
                correlationId: values.decode(String.self, forKey: .correlationId)
            )
        } catch let error as DecodingError {
            throw error
        } catch {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Invalid API problem")
            )
        }
    }
}

public struct SyncEnvelopeV4: Codable, Equatable, Sendable {
    public let contractVersion: Int
    public let audience: String
    public let cursor: String
    public let operations: [JSONValue]
    public let serverTime: WireInstant

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case contractVersion, audience, cursor, operations, serverTime
    }

    public init(
        audience: String,
        cursor: String,
        operations: [JSONValue],
        serverTime: WireInstant
    ) {
        contractVersion = 4
        self.audience = audience
        self.cursor = cursor
        self.operations = operations
        self.serverTime = serverTime
    }

    public init(from decoder: Decoder) throws {
        try decoder.rejectUnknownKeys(allowed: CodingKeys.allCases.map(\.rawValue))
        let values = try decoder.container(keyedBy: CodingKeys.self)
        contractVersion = try values.decode(Int.self, forKey: .contractVersion)
        guard contractVersion == 4 else {
            throw DecodingError.dataCorruptedError(
                forKey: .contractVersion,
                in: values,
                debugDescription: "Only sync contract v4 is supported"
            )
        }
        audience = try values.decode(String.self, forKey: .audience)
        cursor = try values.decode(String.self, forKey: .cursor)
        operations = try values.decode([JSONValue].self, forKey: .operations)
        serverTime = try values.decode(WireInstant.self, forKey: .serverTime)
    }
}

public struct WireInstant: Codable, Equatable, Hashable, Sendable, CustomStringConvertible {
    public let description: String

    public init(_ value: String) throws {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard formatter.date(from: value) != nil else { throw WireContractError.invalidInstant }
        description = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        try self.init(container.decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }

}

public struct WireDate: Codable, Equatable, Hashable, Sendable, CustomStringConvertible {
    public let description: String

    public init(_ value: String) throws {
        let pattern = /^\d{4}-\d{2}-\d{2}$/
        guard value.wholeMatch(of: pattern) != nil else { throw WireContractError.invalidDate }
        description = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        try self.init(container.decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }
}

public struct WireTime: Codable, Equatable, Hashable, Sendable, CustomStringConvertible {
    public let description: String

    public init(_ value: String) throws {
        let pattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/
        guard value.wholeMatch(of: pattern) != nil else { throw WireContractError.invalidTime }
        description = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        try self.init(container.decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }
}

public struct WireDecimal: Codable, Equatable, Hashable, Sendable, CustomStringConvertible {
    public let description: String

    public init(_ value: String) throws {
        guard !value.isEmpty,
              value.range(of: #"^-?(?:0|[1-9]\d*)(?:\.\d+)?$"#, options: .regularExpression) != nil,
              Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")) != nil
        else {
            throw WireContractError.invalidDecimal
        }
        description = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        try self.init(container.decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }
}

public enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Decimal)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Decimal.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case let .bool(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .string(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        }
    }
}

public enum WireContractError: Error, Equatable, Sendable {
    case invalidProblem
    case invalidInstant
    case invalidDate
    case invalidTime
    case invalidDecimal
}

private struct AnyCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        intValue = nil
    }

    init?(intValue: Int) {
        stringValue = String(intValue)
        self.intValue = intValue
    }
}

private extension Decoder {
    func rejectUnknownKeys(allowed: [String]) throws {
        let keys = try container(keyedBy: AnyCodingKey.self).allKeys.map(\.stringValue)
        let unknown = Set(keys).subtracting(allowed)
        guard unknown.isEmpty else {
            throw DecodingError.dataCorrupted(
                .init(
                    codingPath: codingPath,
                    debugDescription: "Unknown fields: \(unknown.sorted().joined(separator: ", "))"
                )
            )
        }
    }
}
