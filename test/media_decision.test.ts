import assert from "node:assert/strict";
import test from "node:test";
import { asset, processAsset } from "../src/media_decision.js";

test("a long valid upload remains unacknowledged for retry instead of being delivered", () => {
  const input = asset.parse({ assetId: "d8bd5874-c41a-43ad-a23c-7b00e217d3d9", creatorId: "creator-17", mediaUrl: "https://cdn.example.org/clip.mp4", format: "mp4", durationSeconds: 601 });
  assert.throws(() => processAsset(input), /delivery window/);
});

test("a short upload produces the creator delivery record", () => {
  const input = asset.parse({ assetId: "d8bd5874-c41a-43ad-a23c-7b00e217d3d9", creatorId: "creator-17", mediaUrl: "https://cdn.example.org/clip.mp4", format: "mp4", durationSeconds: 42 });
  assert.deepEqual(processAsset(input), { assetId: input.assetId, creatorId: "creator-17", deliveryUrl: input.mediaUrl });
});
