export type Stage = 'dev' | 'staging' | 'production';
export const NAASEH_AWS_REGION = 'us-west-2' as const;

export function requireNaasehRegion(region: string = NAASEH_AWS_REGION): typeof NAASEH_AWS_REGION {
  if (region !== NAASEH_AWS_REGION)
    throw new Error(`Naaseh v1 supports only ${NAASEH_AWS_REGION}.`);
  return region;
}

export const environmentName = (stage: Stage, account: string, region = NAASEH_AWS_REGION) =>
  `naaseh-${stage}-${account}-${requireNaasehRegion(region)}`;
