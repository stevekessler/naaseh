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
    name: 'GroupJoinRateLimit',
    priority: 1,
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
    priority: 2,
    action: { block: {} },
    statement: { rateBasedStatement: { aggregateKeyType: 'IP', limit: 500 } },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: 'GlobalRateLimit',
      sampledRequestsEnabled: true,
    },
  },
];
