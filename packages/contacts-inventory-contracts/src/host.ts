import { z } from 'zod';

export const manifestPath = '/features/contacts-inventory/release.json';
export const hostProtocol = 1;
export const apiProtocol = 1;
export const releaseIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u);

const manifestSchema = z.strictObject({
  releaseId: releaseIdSchema,
  hostProtocol: z.literal(hostProtocol),
  apiProtocol: z.literal(apiProtocol),
  entry: z.string(),
  assets: z.array(z.string()).min(1).max(512),
});

export type ReleaseManifest = z.infer<typeof manifestSchema>;

export function artifactPrefix(releaseId: string) {
  return `/features/contacts-inventory/releases/${releaseId}/`;
}

export function parseReleaseManifest(input: unknown): ReleaseManifest | null {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) return null;

  const manifest = parsed.data;
  const prefix = artifactPrefix(manifest.releaseId);
  // Limit segments before the host imports any manifest-controlled module URL.
  const scopedPath = (path: string) =>
    path.startsWith(prefix) &&
    path
      .slice(prefix.length)
      .split('/')
      .every((segment) => /^[\w-][\w.-]*$/u.test(segment));

  if (
    !manifest.entry.endsWith('.js') ||
    !manifest.assets.includes(manifest.entry) ||
    !manifest.assets.every(scopedPath) ||
    new Set(manifest.assets).size !== manifest.assets.length
  )
    return null;

  return manifest;
}

export const featureCatalogs = ['contact-types', 'locations', 'strength-units'] as const;
export type FeatureCatalog = (typeof featureCatalogs)[number];

export type FeatureLocation =
  | { page: 'contacts'; recordId?: string }
  | { page: 'inventory'; recordId?: string }
  | { page: 'medication-list' }
  | { page: 'catalog'; catalog: FeatureCatalog };

export type FeatureLifecycle =
  | 'lock'
  | 'unlock'
  | 'reconnect'
  | 'foreground'
  | 'sign-out'
  | 'revoked';

export interface FeatureHost {
  userId: string;
  isAdmin: boolean;
  request(path: string, options?: RequestInit): Promise<Response>;
  encrypt(slot: string, value: string): Promise<string>;
  decrypt(slot: string, value: string): Promise<string>;
  subscribe(listener: (event: FeatureLifecycle) => void): () => void;
  navigate(location: FeatureLocation): void;
}

export const featureSearchTypes = ['contacts', 'inventory', 'medicine'] as const;
export type FeatureSearchType = (typeof featureSearchTypes)[number];
export type FeatureSearchPreferences = Record<FeatureSearchType, boolean>;
export type FeatureSearchHit = { type: FeatureSearchType; id: string; title: string };
export type FeatureSearch = (
  query: string,
  preferences: FeatureSearchPreferences,
) => FeatureSearchHit[];

export interface FeatureModule {
  protocol: typeof hostProtocol;
  watchSearch?(host: FeatureHost, publish: (search: FeatureSearch | null) => void): () => void;
  mount(container: HTMLElement, location: FeatureLocation, host: FeatureHost): () => void;
}
