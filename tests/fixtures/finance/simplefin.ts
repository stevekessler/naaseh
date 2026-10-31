export const simplefinV2Fixture = Object.freeze({
  errlist: [] as readonly { code: string; msg: string }[],
  connections: [
    {
      conn_id: 'fixture-provider-connection',
      name: 'Example Community Bank - Fixture Login',
      org_id: 'fixture-institution',
      org_name: 'Example Community Bank',
      org_url: 'https://fixture.invalid',
      sfin_url: 'https://fixture.invalid/simplefin',
    },
  ],
  accounts: [
    {
      id: 'fixture-provider-account',
      conn_id: 'fixture-provider-connection',
      name: 'Household Checking',
      currency: 'USD',
      balance: '1250.00',
      'available-balance': '1200.00',
      'balance-date': 1_768_478_400,
      transactions: [
        {
          id: 'fixture-provider-transaction',
          posted: 1_768_564_800,
          amount: '-84.25',
          description: 'Fixture grocery purchase',
          payee: 'Example Market',
          pending: false,
        },
      ],
    },
  ],
});

export const simplefinMissingNamesFixture = Object.freeze({
  errlist: [] as readonly { code: string; msg: string }[],
  connections: [] as readonly unknown[],
  accounts: [
    {
      id: 'fixture-provider-account-needs-attention',
      conn_id: 'fixture-missing-connection',
      currency: 'USD',
      balance: '0.00',
      'balance-date': 1_768_478_400,
      transactions: [],
    },
  ],
});
