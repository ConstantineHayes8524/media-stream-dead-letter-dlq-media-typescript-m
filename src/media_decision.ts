import { z } from "zod";

export const asset = z.object({
  assetId: z.string().uuid(),
  creatorId: z.string().min(1),
  mediaUrl: z.string().url(),
  format: z.enum(["mp4", "webm"]),
  durationSeconds: z.number().positive().max(3600)
});

export type Asset = z.infer<typeof asset>;

export function processAsset(input: Asset): { assetId: string; creatorId: string; deliveryUrl: string } {
  // A deterministic processing decision stands in for a transcoder in this runnable example.
  if (input.durationSeconds > 600) throw new Error("Asset exceeds the creator delivery window");
  return { assetId: input.assetId, creatorId: input.creatorId, deliveryUrl: input.mediaUrl };
}
