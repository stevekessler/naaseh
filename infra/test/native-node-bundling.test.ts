import { describe, expect, it } from 'vitest';
import { withArgon2Bundling, withSharpBundling } from '../lib/native-node-bundling.js';

describe('Lambda native Node module bundling', () => {
  it.each([
    ['Argon2', withArgon2Bundling, '@node-rs/argon2'],
    ['Sharp', withSharpBundling, 'sharp'],
  ] as const)('targets Linux x64 glibc for %s', (_name, bundling, moduleName) => {
    const options = bundling({ minify: true, environment: { EXISTING_SETTING: 'preserved' } });

    expect(options.nodeModules).toEqual([moduleName]);
    expect(options.minify).toBe(true);
    expect(options.environment).toEqual({
      EXISTING_SETTING: 'preserved',
      npm_config_os: 'linux',
      npm_config_cpu: 'x64',
      npm_config_libc: 'glibc',
    });
  });
});
