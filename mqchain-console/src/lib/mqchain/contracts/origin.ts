import { z } from "zod";

export const originActorSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  aud: z.string().min(1).max(200),
  iat: z.number().int().nonnegative(),
  jti: z.string().uuid(),
});

export type OriginActorClaims = z.infer<typeof originActorSchema>;

export type VerifiedOriginActor = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export const originErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  requestId: z.string(),
});

export type OriginErrorEnvelope = z.infer<typeof originErrorEnvelopeSchema>;

