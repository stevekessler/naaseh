import { describe, expect, it } from 'vitest';
import { parseGuardDutyScanResult } from '../../apps/api/src/attachments/scan-result-handler.js';

describe('GuardDuty attachment scan results', () => {
  it('reads the nested result and version fields from the AWS event schema', () => {
    expect(
      parseGuardDutyScanResult(
        {
          s3ObjectDetails: {
            bucketName: 'private-media',
            objectKey: 'attachments/01J00000000000000000000001',
            versionId: 'version-1',
          },
          scanResultDetails: { scanResultStatus: 'NO_THREATS_FOUND' },
        },
        'private-media',
      ),
    ).toEqual({
      blobId: '01J00000000000000000000001',
      versionId: 'version-1',
      result: 'NO_THREATS_FOUND',
    });
  });

  it('ignores malformed results and results for another bucket', () => {
    expect(
      parseGuardDutyScanResult(
        {
          s3ObjectDetails: {
            bucketName: 'another-bucket',
            objectKey: 'attachments/01J00000000000000000000001',
            versionId: 'version-1',
          },
          scanResultDetails: { scanResultStatus: 'NO_THREATS_FOUND' },
        },
        'private-media',
      ),
    ).toBeUndefined();
    expect(parseGuardDutyScanResult({}, 'private-media')).toBeUndefined();
  });
});
