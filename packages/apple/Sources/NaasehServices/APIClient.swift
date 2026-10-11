import Foundation
import NaasehContracts

public struct NativeClientIdentity: Sendable {
    public let platform: NativePlatform
    public let buildNumber: Int
    public let contractVersion: Int

    public init(platform: NativePlatform, buildNumber: Int, contractVersion: Int) {
        self.platform = platform
        self.buildNumber = buildNumber
        self.contractVersion = contractVersion
    }
}

public struct NativeSessionCredential: Equatable, Sendable {
    public let cookieName: String
    public let cookieValue: String
    public let csrfToken: String

    public init(cookieName: String = "__Host-naaseh", cookieValue: String, csrfToken: String) {
        self.cookieName = cookieName
        self.cookieValue = cookieValue
        self.csrfToken = csrfToken
    }
}

public struct APIResponse: Sendable {
    public let statusCode: Int
    public let headers: [String: String]
    public let body: Data
}

public enum APIClientError: Error, Equatable, Sendable {
    case invalidBaseURL
    case disallowedURL
    case insecureProductionOrigin
    case redirectRejected
    case invalidResponse
    case responseTooLarge
    case uploadFileUnavailable
    case transport(String)
}

public actor APIClient {
    public typealias CookieObserver = @Sendable ([HTTPCookie]) async -> Void

    private let baseURL: URL
    private let identity: NativeClientIdentity
    private let session: URLSession
    private let cookieObserver: CookieObserver?
    private let maximumAttempts: Int

    public init(
        baseURL: URL,
        identity: NativeClientIdentity,
        allowLocalDevelopment: Bool = false,
        maximumAttempts: Int = 3,
        cookieObserver: CookieObserver? = nil,
        protocolClasses: [AnyClass]? = nil
    ) throws {
        guard let scheme = baseURL.scheme?.lowercased(), let host = baseURL.host?.lowercased() else {
            throw APIClientError.invalidBaseURL
        }
        let isLoopback = host == "localhost" || host == "127.0.0.1" || host == "::1"
        if host == NaasehServicesModule.productionHost, scheme != "https" {
            throw APIClientError.insecureProductionOrigin
        }
        guard (scheme == "https" && host == NaasehServicesModule.productionHost)
            || (allowLocalDevelopment && isLoopback && scheme == "http")
        else {
            throw APIClientError.disallowedURL
        }

        self.baseURL = baseURL
        self.identity = identity
        self.cookieObserver = cookieObserver
        self.maximumAttempts = max(1, maximumAttempts)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpShouldSetCookies = false
        configuration.httpAdditionalHeaders = ["Accept": "application/json"]
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 120
        if let protocolClasses { configuration.protocolClasses = protocolClasses }
        session = URLSession(configuration: configuration, delegate: RedirectRejectingDelegate(), delegateQueue: nil)
    }

    public func request(
        path: String,
        method: String = "GET",
        body: Data? = nil,
        contentType: String = "application/json",
        session credential: NativeSessionCredential? = nil,
        idempotencyKey: String? = nil,
        maximumResponseBytes: Int = 2 * 1024 * 1024
    ) async throws -> APIResponse {
        let url = try allowedURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method.uppercased()
        request.httpBody = body
        if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        applyHeaders(to: &request, credential: credential, idempotencyKey: idempotencyKey)
        return try await execute(request, maximumResponseBytes: maximumResponseBytes)
    }

    public func upload(
        path: String,
        fileURL: URL,
        contentType: String,
        session credential: NativeSessionCredential,
        idempotencyKey: String
    ) async throws -> APIResponse {
        guard FileManager.default.isReadableFile(atPath: fileURL.path) else {
            throw APIClientError.uploadFileUnavailable
        }
        var request = URLRequest(url: try allowedURL(path: path))
        request.httpMethod = "PUT"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        applyHeaders(to: &request, credential: credential, idempotencyKey: idempotencyKey)
        do {
            let (data, response) = try await session.upload(for: request, fromFile: fileURL)
            return try await checkedResponse(data, response: response, maximumBytes: 256 * 1024)
        } catch let error as APIClientError {
            throw error
        } catch {
            throw APIClientError.transport(String(describing: type(of: error)))
        }
    }

    public func download(
        path: String,
        session credential: NativeSessionCredential,
        maximumBytes: Int
    ) async throws -> (temporaryURL: URL, response: APIResponse) {
        var request = URLRequest(url: try allowedURL(path: path))
        request.httpMethod = "GET"
        applyHeaders(to: &request, credential: credential, idempotencyKey: nil)
        let (url, response) = try await session.download(for: request)
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        let size = (attributes[.size] as? NSNumber)?.intValue ?? 0
        guard size <= maximumBytes else {
            try? FileManager.default.removeItem(at: url)
            throw APIClientError.responseTooLarge
        }
        let checked = try await checkedResponse(Data(), response: response, maximumBytes: 0)
        return (url, checked)
    }

    private func execute(_ request: URLRequest, maximumResponseBytes: Int) async throws -> APIResponse {
        let retryableMethod = request.httpMethod == "GET" || request.httpMethod == "HEAD"
            || request.value(forHTTPHeaderField: "Idempotency-Key") != nil
        var lastTransportError: Error?

        for attempt in 1 ... maximumAttempts {
            do {
                let (data, response) = try await session.data(for: request)
                let checked = try await checkedResponse(
                    data,
                    response: response,
                    maximumBytes: maximumResponseBytes
                )
                let retryableStatus = checked.statusCode == 429 || (500 ... 599).contains(checked.statusCode)
                if retryableMethod, retryableStatus, attempt < maximumAttempts { continue }
                return checked
            } catch {
                lastTransportError = error
                if !retryableMethod || attempt == maximumAttempts { break }
            }
        }
        if let error = lastTransportError as? APIClientError { throw error }
        throw APIClientError.transport(lastTransportError.map { String(describing: type(of: $0)) } ?? "unknown")
    }

    private func checkedResponse(
        _ data: Data,
        response: URLResponse,
        maximumBytes: Int
    ) async throws -> APIResponse {
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard http.url?.host?.lowercased() == baseURL.host?.lowercased() else {
            throw APIClientError.disallowedURL
        }
        guard data.count <= maximumBytes || maximumBytes == 0 else {
            throw APIClientError.responseTooLarge
        }
        let headerFields = http.allHeaderFields.reduce(into: [String: String]()) { result, item in
            result[String(describing: item.key).lowercased()] = String(describing: item.value)
        }
        if let cookieObserver {
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: baseURL)
                .filter { $0.isSecure && $0.path == "/" }
            if !cookies.isEmpty { await cookieObserver(cookies) }
        }
        return APIResponse(statusCode: http.statusCode, headers: headerFields, body: data)
    }

    private func applyHeaders(
        to request: inout URLRequest,
        credential: NativeSessionCredential?,
        idempotencyKey: String?
    ) {
        request.setValue(identity.platform.rawValue, forHTTPHeaderField: "X-Naaseh-Client-Platform")
        request.setValue(String(identity.buildNumber), forHTTPHeaderField: "X-Naaseh-Client-Build")
        request.setValue(String(identity.contractVersion), forHTTPHeaderField: "X-Naaseh-Contract-Version")
        if let credential {
            request.setValue(
                "\(credential.cookieName)=\(credential.cookieValue)",
                forHTTPHeaderField: "Cookie"
            )
            request.setValue(baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
            if !["GET", "HEAD", "OPTIONS"].contains(request.httpMethod ?? "GET") {
                request.setValue(credential.csrfToken, forHTTPHeaderField: "X-CSRF-Token")
            }
        }
        if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
    }

    private func allowedURL(path: String) throws -> URL {
        guard !path.contains(".."), let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.scheme?.lowercased() == baseURL.scheme?.lowercased(),
              url.host?.lowercased() == baseURL.host?.lowercased(),
              url.port == baseURL.port
        else {
            throw APIClientError.disallowedURL
        }
        return url
    }
}

private final class RedirectRejectingDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _: URLSession,
        task _: URLSessionTask,
        willPerformHTTPRedirection _: HTTPURLResponse,
        newRequest _: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}
