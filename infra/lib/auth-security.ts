import type * as wafv2 from 'aws-cdk-lib/aws-wafv2';

export const authSecurityRules: wafv2.CfnWebACL.RuleProperty[] = [
  {
    name: 'LoginRateLimit',
    priority: 0,
    action: { block: {} },
    statement: {
      rateBasedStatement: {
        aggregateKeyType: 'IP',
        limit: 100,
        scopeDownStatement: {
          byteMatchStatement: {
            fieldToMatch: { uriPath: {} },
            positionalConstraint: 'EXACTLY',
            searchString: '/api/v1/auth/login',
            textTransformations: [{ priority: 0, type: 'NONE' }],
          },
        },
      },
    },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: 'LoginRateLimit',
      sampledRequestsEnabled: true,
    },
  },
  {
    name: 'SensitiveAuthRateLimit',
    priority: 1,
    action: { block: {} },
    statement: {
      rateBasedStatement: {
        aggregateKeyType: 'IP',
        limit: 30,
        evaluationWindowSec: 60,
        scopeDownStatement: {
          byteMatchStatement: {
            fieldToMatch: { uriPath: {} },
            positionalConstraint: 'STARTS_WITH',
            searchString: '/api/v1/auth/tfa',
            textTransformations: [{ priority: 0, type: 'NONE' }],
          },
        },
      },
    },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: 'SensitiveAuthRateLimit',
      sampledRequestsEnabled: true,
    },
  },
  {
    name: 'PasswordResetRateLimit',
    priority: 2,
    action: { block: {} },
    statement: {
      rateBasedStatement: {
        aggregateKeyType: 'IP',
        limit: 20,
        evaluationWindowSec: 60,
        scopeDownStatement: {
          byteMatchStatement: {
            fieldToMatch: { uriPath: {} },
            positionalConstraint: 'EXACTLY',
            searchString: '/api/v1/auth/password-reset',
            textTransformations: [{ priority: 0, type: 'NONE' }],
          },
        },
      },
    },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: 'PasswordResetRateLimit',
      sampledRequestsEnabled: true,
    },
  },
  {
    name: 'GroupJoinRateLimit',
    priority: 3,
    action: { block: {} },
    statement: {
      rateBasedStatement: {
        aggregateKeyType: 'IP',
        limit: 10,
        evaluationWindowSec: 60,
        scopeDownStatement: {
          byteMatchStatement: {
            fieldToMatch: { uriPath: {} },
            positionalConstraint: 'ENDS_WITH',
            searchString: '/join',
            textTransformations: [{ priority: 0, type: 'NONE' }],
          },
        },
      },
    },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: 'GroupJoinRateLimit',
      sampledRequestsEnabled: true,
    },
  },
  {
    name: 'GlobalRateLimit',
    priority: 4,
    action: { block: {} },
    statement: { rateBasedStatement: { aggregateKeyType: 'IP', limit: 500 } },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: 'GlobalRateLimit',
      sampledRequestsEnabled: true,
    },
  },
];
