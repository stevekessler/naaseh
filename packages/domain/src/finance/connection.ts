import { z } from 'zod';
import type { FinanceScope } from './scope.js';
import { parseMajorUnits } from './money.js';

export interface FinanceConnection {
  id: string;
  scope: FinanceScope;
  provider: 'simplefin-bridge';
  status: 'active' | 'attention' | 'revoked' | 'archived';
  encryptedAccessUrl: string;
  credentialKeyId: string;
  credentialContextVersion: number;
  lastAttemptAt?: string;
  lastSuccessfulAt?: string;
  lastSuccessfulStartDate?: string;
  version: number;
}

const boundedText = z.string().min(1).max(1_000);
const simplefinTransactionSchema = z
  .object({
    id: z.string().min(1).max(500),
    posted: z.number().int().nonnegative().optional(),
    transacted_at: z.number().int().nonnegative().optional(),
    amount: boundedText,
    description: boundedText,
    payee: z.string().max(500).optional(),
    pending: z.boolean().optional(),
  })
  .passthrough();
const simplefinAccountSchema = z
  .object({
    id: z.string().min(1).max(500),
    name: z.string().max(200).optional(),
    conn_id: z.string().min(1).max(500).optional(),
    org: z
      .object({ name: z.string().max(200).optional(), domain: z.string().max(253).optional() })
      .passthrough()
      .optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    balance: boundedText,
    'available-balance': boundedText.optional(),
    'balance-date': z.number().int().nonnegative(),
    transactions: z.array(simplefinTransactionSchema).max(50_000).optional(),
  })
  .passthrough();
const simplefinConnectionSchema = z
  .object({
    conn_id: z.string().min(1).max(500),
    name: z.string().min(1).max(200),
    org_id: z.string().min(1).max(500),
    org_name: z.string().min(1).max(200).optional(),
    org_url: z.string().max(2_048).optional(),
    sfin_url: z.string().max(2_048),
  })
  .passthrough();
const payloadSchema = z
  .object({
    accounts: z.array(simplefinAccountSchema).max(500),
    connections: z.array(simplefinConnectionSchema).max(500).optional(),
    errors: z.array(z.string().max(500)).max(100).optional(),
    errlist: z
      .array(
        z
          .object({
            code: z.string().max(100),
            msg: z.string().max(500),
            conn_id: z.string().max(500).optional(),
            account_id: z.string().max(500).optional(),
          })
          .passthrough(),
      )
      .max(100)
      .optional(),
  })
  .passthrough();

export function parseSimplefinV2(payload: unknown) {
  const parsed = payloadSchema.parse(payload);
  const connections = new Map(
    (parsed.connections ?? []).map((connection) => [connection.conn_id, connection]),
  );
  return {
    errors:
      parsed.errlist?.map(({ code, msg, conn_id, account_id }) => ({
        code,
        message: msg,
        ...(conn_id ? { providerConnectionId: conn_id } : {}),
        ...(account_id ? { providerAccountId: account_id } : {}),
      })) ??
      parsed.errors?.map((message) => ({ code: 'provider', message })) ??
      [],
    accounts: parsed.accounts.map((account) => {
      const connection = account.conn_id ? connections.get(account.conn_id) : undefined;
      const organizationName =
        connection?.org_name?.trim() ||
        connection?.name.trim() ||
        account.org?.name?.trim() ||
        undefined;
      return {
        providerAccountId: account.id,
        ...(account.conn_id ? { providerConnectionId: account.conn_id } : {}),
        sourceName: account.name?.trim() || undefined,
        organizationName,
        needsIdentityCompletion: !account.name?.trim() || !organizationName,
        currency: account.currency,
        balanceMinor: parseMajorUnits(account.balance, account.currency),
        ...(account['available-balance'] === undefined
          ? {}
          : {
              availableBalanceMinor: parseMajorUnits(
                account['available-balance'],
                account.currency,
              ),
            }),
        balanceAt: new Date(account['balance-date'] * 1_000).toISOString(),
        transactions: (account.transactions ?? []).map((transaction) => ({
          sourceTransactionId: transaction.id,
          amountMinor: parseMajorUnits(transaction.amount, account.currency),
          description: transaction.description,
          postedAt:
            transaction.posted === undefined || transaction.posted === 0
              ? null
              : new Date(transaction.posted * 1_000).toISOString(),
          transactedAt:
            transaction.transacted_at === undefined
              ? undefined
              : new Date(transaction.transacted_at * 1_000).toISOString(),
          pending: transaction.pending ?? transaction.posted === 0,
          payee: transaction.payee,
        })),
      };
    }),
  };
}
