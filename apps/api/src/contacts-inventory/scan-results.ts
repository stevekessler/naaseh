import type { ImagePointer } from '@naaseh/contacts-inventory-contracts';

export function matchesImageSignature(type: ImagePointer['mediaType'], bytes: Uint8Array) {
  const signature =
    type === 'image/png' ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] : [0xff, 0xd8, 0xff];
  return signature.every((value, offset) => bytes[offset] === value);
}

export function scanState(tag: string | undefined) {
  if (tag === undefined) return 'pending';
  if (tag === 'NO_THREATS_FOUND') return 'clean';
  return 'rejected';
}
