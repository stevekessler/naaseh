import { readFileSync } from 'node:fs';

/** Offline paid-rate sensitivity only. No SDK, credentials, cloud calls or file uploads. */
const sizing = JSON.parse(
  readFileSync(new URL('../docs/testing/finance-publication-sizing.json', import.meta.url), 'utf8'),
) as {
  householdPlanning: {
    ongoingReceiptUploadsPerMonth: number;
    ongoingReceiptAverageBytes: number;
    ongoingReceiptViewsPerMonth: number;
    initialReceiptFileCount: number;
    receiptStorageClass: string;
    receiptAutomaticStorageTiering: boolean;
  };
};
const household = sizing.householdPlanning;
if (
  household.initialReceiptFileCount !== 0 ||
  household.receiptStorageClass !== 'STANDARD' ||
  household.receiptAutomaticStorageTiering !== false
)
  throw new Error('Receipt model must preserve the approved import/storage assumptions.');
for (const value of [
  household.ongoingReceiptUploadsPerMonth,
  household.ongoingReceiptAverageBytes,
  household.ongoingReceiptViewsPerMonth,
])
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid household receipt inputs.');
const rate = {
  standardGBMonth: 0.023,
  warmBackupGBMonth: 0.05,
  guardDutyGB: 0.09,
  guardDutyObject: 0.000215,
  internetGB: 0.09,
  tagMonth: 0.00000065,
};
const previous = {
  combined: 6.468801,
  originalAndVersionGB: 2,
  backupGB: 1,
  scannedGB: 0.1,
  scannedObjects: 200,
  tags: 2000,
  tagMonthlyUSD: 0.002,
  internetGB: 1,
};
const reserve = 1.3;
const monthlyBytes = household.ongoingReceiptUploadsPerMonth * household.ongoingReceiptAverageBytes;
const round = (value: number) => Number(value.toFixed(9));
const oldReceiptStorage =
  previous.originalAndVersionGB * rate.standardGBMonth + previous.backupGB * rate.warmBackupGBMonth;
const results = [1, 12, 24, 60, 120].map((month) => {
  const originals = (monthlyBytes * month) / 2 ** 30;
  const objects = household.ongoingReceiptUploadsPerMonth * month;
  const originalStorage = originals * rate.standardGBMonth;
  // Existing conservative research reserve: one additional full original set in versions, one in warm backups.
  const versionReserve = originalStorage,
    backupReserve = originals * rate.warmBackupGBMonth;
  const receiptStorage = originalStorage + versionReserve + backupReserve;
  const scannedGBReserve = monthlyBytes / 1e9; // Deliberately retain the decimal 0.1 GB scan allowance, no free tier.
  const scan =
    scannedGBReserve * rate.guardDutyGB +
    household.ongoingReceiptUploadsPerMonth * rate.guardDutyObject;
  const oldScan =
    previous.scannedGB * rate.guardDutyGB + previous.scannedObjects * rate.guardDutyObject;
  const tagReserve = Math.max(previous.tags, objects) * rate.tagMonth;
  const storageAndScanOnly =
    previous.combined +
    reserve *
      (receiptStorage - oldReceiptStorage + scan - oldScan + tagReserve - previous.tagMonthlyUSD);
  // Original view count remains an unconfirmed stress assumption; round transfer reserve upward, not a user promise.
  const transferGBReserve = 0.5 + (1000 * household.ongoingReceiptAverageBytes) / 1e9;
  const combinedSensitivity =
    storageAndScanOnly + reserve * (transferGBReserve - previous.internetGB) * rate.internetGB;
  const downloads = [...new Set([household.ongoingReceiptViewsPerMonth, 100, 1000])].map(
    (views) => {
      const receiptBytes = views * household.ongoingReceiptAverageBytes;
      const transferReserveGB = 0.5 + receiptBytes / 1e9;
      const total =
        storageAndScanOnly + reserve * (transferReserveGB - previous.internetGB) * rate.internetGB;
      return {
        viewsPerMonth: views,
        receiptBytesPerMonth: receiptBytes,
        transferReserveGB: round(transferReserveGB),
        conditionalCombinedUSD: round(total),
        remainingUnderCeilingUSD: round(6.5 - total),
      };
    },
  );
  return {
    month,
    retainedOriginalObjects: objects,
    retainedOriginalBytes: monthlyBytes * month,
    originalsBillingGiB: round(originals),
    originalStorageUSD: round(originalStorage),
    versionStorageReserveUSD: round(versionReserve),
    warmBackupReserveUSD: round(backupReserve),
    receiptStorageDirectUSD: round(receiptStorage),
    scanDirectUSD: round(scan),
    tagReserveDirectUSD: round(tagReserve),
    conditionalCombinedStorageScanOnlyUSD: round(storageAndScanOnly),
    conditionalCombinedIncludingDownloadSensitivityUSD: round(combinedSensitivity),
    remainingUnderCeilingIncludingDownloadSensitivityUSD: round(6.5 - combinedSensitivity),
    conditionalCombinedUsingHouseholdViewsUSD: downloads[0]!.conditionalCombinedUSD,
    downloadSensitivities: downloads,
  };
});
process.stdout.write(
  JSON.stringify(
    {
      date: '2026-11-07',
      region: 'us-west-2',
      evidence:
        'Offline quantity sensitivity at publicly verified regional paid rates; no AWS calls, bills or acceptance.',
      household: {
        receiptUploadsPerMonth: household.ongoingReceiptUploadsPerMonth,
        averageBytes: household.ongoingReceiptAverageBytes,
        receiptViewsPerMonth: household.ongoingReceiptViewsPerMonth,
        receiptViewInterpretation:
          'Two total monthly views; alternate twice per receipt/100 monthly views remains a sensitivity.',
        storageClass: household.receiptStorageClass,
        automaticTiering: false,
        initialReceiptFiles: 0,
        newOriginalBytesPerMonth: monthlyBytes,
      },
      rateUSD: rate,
      previousConditionalScenario: previous,
      contingencyPercent: 30,
      ceilingUSD: 6.5,
      method:
        'End-of-month retained bytes (a conservative run-rate, not first-month average billing); S3 billing GB=2^30 bytes. One full original set reserved for versions plus warm backups; no current-original expiration or cold-tier saving.',
      sources: [
        {
          service: 'AmazonS3',
          url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-west-2/index.json',
          publicationDate: '2026-11-04T17:44:45Z',
          sku: 'Z3FQZG73HYSPVABR',
          usage: 'USW2-TimedStorage-ByteHrs',
          rangeGB: '0-51200',
          tagSKU: 'F7Q89DC8BTTRFSXU',
        },
        {
          service: 'AWSBackup',
          url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSBackup/current/us-west-2/index.json',
          publicationDate: '2026-10-14T00:18:56Z',
          sku: 'TTFHUXMUM62ZHDFZ',
          usage: 'USW2-WarmStorage-ByteHrs-S3',
        },
        {
          service: 'AmazonGuardDuty',
          url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonGuardDuty/current/us-west-2/index.json',
          publicationDate: '2026-10-30T00:56:14Z',
          paidRequestSKU: '5QSHK3K93E8KUCHE',
          paidScanSKU: 'FAFFFT3JK4H4RANT',
        },
      ],
      caveats: [
        'Not a new accepted household total. Original stress compute/read/write/log/KMS/request reserves remain unchanged; latest source-proof overhead is not fully allocated.',
        'User monthly views interpreted as 2 total; 100/month retains the ambiguous twice-per-receipt reading. 1000/month remains inherited stress, not household fact. Non-receipt transfer reserve of 0.5 GB is unchanged.',
        'Full extra version/backup sets are conservative reserves, not observed version churn or a claim that 35 daily backups duplicate every object 35 times.',
        'Originals start empty, remain Standard and retained; month60/month120 are forecast horizons, never deletion deadlines. No provider/raw-import or transaction costs removed.',
        'No free tier/credits/backup-tier discount used. Initial five-year transaction ingestion, retry/replacement bursts, restores, actual backup growth and billed capacity remain unaccepted.',
      ],
      results,
    },
    null,
    2,
  ) + '\n',
);
