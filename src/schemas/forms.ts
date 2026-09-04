/**
 * Form schemas. Shared by react-hook-form on the client and, where a form
 * writes through an Edge Function, by the function on the server.
 */

import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .email({ message: 'auth.invalidEmail' });

export const passwordSchema = z.string().min(8, { message: 'auth.passwordTooShort' });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const signUpSchema = z.object({
  firstName: z.string().trim().min(1).max(40),
  email: emailSchema,
  password: passwordSchema,
});

export const resetRequestSchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'auth.passwordsDontMatch',
    path: ['confirm'],
  });

export const listingSchema = z
  .object({
    title: z.string().trim().min(2).max(80),
    toolType: z.string().trim().min(1).max(60),
    brand: z.string().trim().max(60).nullable().default(null),
    model: z.string().trim().max(60).nullable().default(null),
    isModelConfirmed: z.boolean().default(false),
    categorySlug: z.string().min(1),
    description: z.string().trim().max(400).nullable().default(null),
    condition: z.enum(['like_new', 'good', 'worn']).nullable().default(null),
    accessories: z.string().trim().max(200).nullable().default(null),
    instructions: z.string().trim().max(400).nullable().default(null),
    maxBorrowDays: z.number().int().min(1).max(90).nullable().default(null),
    isFree: z.boolean(),
    /** Agorot. Required when isFree is false. */
    pricePerDayAgorot: z.number().int().min(0).max(10_000_00).nullable().default(null),
    availabilityMode: z.enum(['now', 'dates', 'ask']),
    risk: z.enum(['low', 'medium', 'high']).default('low'),
    coords: z.object({ latitude: z.number(), longitude: z.number() }),
    neighbourhood: z.string().max(80).nullable().default(null),
  })
  .refine((v) => v.isFree || (v.pricePerDayAgorot != null && v.pricePerDayAgorot > 0), {
    message: 'A rental needs a price per day.',
    path: ['pricePerDayAgorot'],
  });

export type ListingInput = z.infer<typeof listingSchema>;

export const borrowRequestSchema = z
  .object({
    toolId: z.string().uuid(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    message: z.string().trim().max(300).nullable().default(null),
    riskAcknowledged: z.boolean().default(false),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    message: 'The end has to be after the start.',
    path: ['endAt'],
  });

export const ratingSchema = z.object({
  transactionId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(40)).max(6).default([]),
  comment: z.string().trim().max(140).nullable().default(null),
});

export const disputeSchema = z.object({
  transactionId: z.string().uuid(),
  reason: z.enum(['damaged', 'not_returned', 'not_as_described', 'other']),
  description: z.string().trim().min(10).max(2000),
  photoPaths: z.array(z.string()).max(6).default([]),
});

export const toolRequestSchema = z.object({
  rawText: z.string().trim().min(2).max(300),
  radiusM: z.number().int().min(200).max(20_000),
  neededFrom: z.string().datetime().nullable().default(null),
  neededTo: z.string().datetime().nullable().default(null),
});
