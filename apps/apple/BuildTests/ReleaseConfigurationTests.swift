import Foundation
import XCTest

final class ReleaseConfigurationTests: XCTestCase {
    func testTestFlightConfigurationIsProductionOnlyAndSecretFree() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let config = try String(contentsOf: root.appending(path: "Config/TestFlight.xcconfig"), encoding: .utf8)
        XCTAssertTrue(config.contains("https:/$()/gsd.thepandas.link"))
        for forbidden in ["localhost", "127.0.0.1", "AWS_SECRET", "PRIVATE_KEY", "SESSION_SECRET", "APNS_KEY"] {
            XCTAssertFalse(config.localizedCaseInsensitiveContains(forbidden), forbidden)
        }
    }

    func testOnlyArm64NativeOS27TargetsAreConfigured() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let project = try String(contentsOf: root.appending(path: "Naaseh.xcodeproj/project.pbxproj"), encoding: .utf8)
        XCTAssertTrue(project.contains("IPHONEOS_DEPLOYMENT_TARGET = 27.0"))
        XCTAssertTrue(project.contains("MACOSX_DEPLOYMENT_TARGET = 27.0"))
        XCTAssertTrue(project.contains("ARCHS = arm64"))
        XCTAssertTrue(project.contains("SUPPORTS_MACCATALYST = NO"))
        XCTAssertFalse(project.contains("x86_64"))
    }
}
