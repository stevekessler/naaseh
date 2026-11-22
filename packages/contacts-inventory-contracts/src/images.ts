import { z } from 'zod';

export const imageByteLimit = 25 * 1024 * 1024;
export const imageReadChunk = 4 * 1024 * 1024;
export const imageTypeSchema = z.enum(['image/jpeg', 'image/png']);
export const imagePointerSchema = z.strictObject({
  id: z.uuid(),
  mediaType: imageTypeSchema,
  bytes: z.int().min(1).max(imageByteLimit),
});
export const imageGenerationSchema = z.int().nonnegative();
export const imageCandidateInputSchema = imagePointerSchema.extend({
  filename: z
    .string()
    .min(1)
    .max(160)
    .refine((name) =>
      Array.from(name).every(
        (character) => character.charCodeAt(0) > 31 && character !== '/' && character !== '\\',
      ),
    ),
  imageGeneration: imageGenerationSchema,
});
export type ImagePointer = z.infer<typeof imagePointerSchema>;
