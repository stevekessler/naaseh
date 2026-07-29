import type * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';

const lambdaLinuxNpmEnvironment = {
  npm_config_os: 'linux',
  npm_config_cpu: 'x64',
  npm_config_libc: 'glibc',
} as const;

function withLambdaLinuxNativeModules(
  nodeModules: string[],
  options: nodejs.BundlingOptions = {},
): nodejs.BundlingOptions {
  return {
    ...options,
    nodeModules,
    environment: {
      ...options.environment,
      ...lambdaLinuxNpmEnvironment,
    },
  };
}

export function withArgon2Bundling(options: nodejs.BundlingOptions = {}): nodejs.BundlingOptions {
  return withLambdaLinuxNativeModules(['@node-rs/argon2'], options);
}

export function withSharpBundling(options: nodejs.BundlingOptions = {}): nodejs.BundlingOptions {
  return withLambdaLinuxNativeModules(['sharp'], options);
}
