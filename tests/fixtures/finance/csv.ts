export const signedAmountCsvFixture = [
  'date,description,payee,amount',
  '2026-01-16,Fixture grocery purchase,Example Market,-84.25',
  '2026-01-17,Fixture deposit,Example Employer,250.00',
].join('\r\n');

export const debitCreditCsvFixture = [
  'date,description,debit,credit',
  '01/16/2026,Fixture transit pass,25.00,',
  '1/17/2026,Fixture refund,,10.00',
].join('\n');

export const suspectedDuplicateCsvFixture = [
  'date,description,amount',
  '2026-01-16,Fixture duplicate candidate,-84.25',
  '2026-01-16,Fixture duplicate candidate,-84.25',
].join('\n');
