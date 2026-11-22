// The host needs only the queue index to warn and clear data when the feature is inactive.
export const featureDatabaseName = 'naaseh-contacts-inventory';
export const featureDatabaseVersion = 1;
export const featureDatabaseSchema = {
  records: '[account+key],account',
  outbox: '++order,account,[account+target]',
  sync: 'account',
};
