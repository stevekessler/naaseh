import Foundation
import NaasehContracts
import NaasehTestSupport
import Testing

@Suite("Apple golden contracts")
struct GoldenContractTests {
    @Test("API problem decodes and re-encodes without semantic drift")
    func apiProblemRoundTrip() throws {
        let input = try AppleFixtureLoader.data(at: "contracts/api-problem.json")
        let problem = try JSONDecoder().decode(APIProblem.self, from: input)

        #expect(problem.status == 400)
        #expect(problem.code == "validation_failed")
        #expect(try jsonObject(JSONEncoder().encode(problem)) == jsonObject(input))
    }

    @Test("API problem rejects unknown and invalid boundary values")
    func apiProblemBoundaries() throws {
        let unknown = Data(
            #"{"type":"urn:naaseh:problem:x","title":"X","status":400,"code":"x","message":"X","correlationId":"c","protected":"leak"}"#.utf8
        )
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(APIProblem.self, from: unknown)
        }

        let invalidStatus = Data(
            #"{"type":"urn:naaseh:problem:x","title":"X","status":200,"code":"x","message":"X","correlationId":"c"}"#.utf8
        )
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(APIProblem.self, from: invalidStatus)
        }
    }

    @Test("Sync v4 envelope preserves lossless values")
    func syncEnvelopeRoundTrip() throws {
        let input = try AppleFixtureLoader.data(at: "contracts/sync-envelope-v4.json")
        let envelope = try JSONDecoder().decode(SyncEnvelopeV4.self, from: input)

        #expect(envelope.contractVersion == 4)
        #expect(envelope.operations.isEmpty)
        #expect(try jsonObject(JSONEncoder().encode(envelope)) == jsonObject(input))
    }

    @Test("Lossless decimal uses a JSON string")
    func losslessDecimal() throws {
        let value = try JSONDecoder().decode(WireDecimal.self, from: Data(#""123.4500""#.utf8))
        #expect(value.description == "123.4500")
        #expect(String(decoding: try JSONEncoder().encode(value), as: UTF8.self) == #""123.4500""#)
    }

    private func jsonObject(_ data: Data) throws -> NSDictionary {
        try #require(JSONSerialization.jsonObject(with: data) as? NSDictionary)
    }
}
