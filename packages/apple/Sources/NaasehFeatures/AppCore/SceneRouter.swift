import Foundation
import Observation

public enum ExternalRouteSource: String, Sendable { case link, alert, siri, search, file, restoration }
public enum SceneRouteResult: Equatable, Sendable { case routed(AppRoute), stale, unauthorized, malformed }
public struct SceneRouteRequest: Equatable, Sendable {
    public let source: ExternalRouteSource
    public let section: AppSection
    public let kind: String?
    public let opaqueID: String?
    public init(source: ExternalRouteSource, section: AppSection, kind: String? = nil, opaqueID: String? = nil) { self.source = source; self.section = section; self.kind = kind; self.opaqueID = opaqueID }
}

@MainActor
@Observable
public final class SceneRouter {
    public var selectedSection: AppSection
    public var path: [AppRoute]
    public var inspectorPresented: Bool
    public private(set) var lastResult: SceneRouteResult?
    private var activeSceneID: String?

    public init(restoration: RedactedRestorationModel = .init()) {
        selectedSection = restoration.selectedSection; path = []; inspectorPresented = restoration.inspectorPresented
    }
    public func activate(sceneID: String) { activeSceneID = sceneID }
    public func route(_ request: SceneRouteRequest, authorized: @Sendable (String, String) async -> Bool, exists: @Sendable (String, String) async -> Bool) async -> SceneRouteResult {
        let route: AppRoute
        if let kind = request.kind, let id = request.opaqueID {
            guard await authorized(kind, id) else { lastResult = .unauthorized; return .unauthorized }
            guard await exists(kind, id) else { lastResult = .stale; return .stale }
            route = .transientDetail(kind: kind, opaqueID: id)
        } else { route = .section(request.section) }
        selectedSection = request.section; path = [route]; lastResult = .routed(route); return .routed(route)
    }
    public func route(url: URL, source: ExternalRouteSource, authorized: @Sendable (String, String) async -> Bool, exists: @Sendable (String, String) async -> Bool) async -> SceneRouteResult {
        guard url.scheme == "naaseh", let host = url.host, let section = AppSection(rawValue: host) else { lastResult = .malformed; return .malformed }
        let parts = url.pathComponents.filter { $0 != "/" }
        let request = parts.count >= 2 ? SceneRouteRequest(source: source, section: section, kind: parts[0], opaqueID: parts[1]) : .init(source: source, section: section)
        return await route(request, authorized: authorized, exists: exists)
    }
    public func restore(_ model: RedactedRestorationModel) { selectedSection = model.selectedSection; inspectorPresented = model.inspectorPresented; path.removeAll() }
    public func redactedRestoration() -> RedactedRestorationModel { .init(selectedSection: selectedSection, inspectorPresented: inspectorPresented) }
    public func lock() { path.removeAll(); inspectorPresented = false; activeSceneID = nil; lastResult = nil }
}
