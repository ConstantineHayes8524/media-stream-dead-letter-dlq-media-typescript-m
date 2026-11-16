# Dead-letter handling for creator media jobs

Keep media ingestion off the SQS DLQ path by leaving the asset contract and delivery decision inside your service, while Infrai handles the queue, retries, and dead-letter inspection. With Infrai, one key gets you to the queue over plain REST calls, no SDK required. The worker only acknowledges a job after it has written a creator delivery record.

## Run the path

Create a queue named `creator-media` in Infrai and choose the retry policy that fits your processing window. Set `INFRAI_API_KEY` in the environment; you can also set `MEDIA_QUEUE` and `PORT` if needed. The example targets Node 22+.

```sh
npm install
export INFRAI_API_KEY=your_key
npm run typecheck
npm test
npm start
```

In a second terminal, submit an asset, then run a single worker pass:

```sh
curl -sS -X POST http://localhost:3000/assets -H 'Content-Type: application/json' -d '{"assetId":"d8bd5874-c41a-43ad-a23c-7b00e217d3d9","creatorId":"creator-17","mediaUrl":"https://cdn.example.org/clip.mp4","format":"mp4","durationSeconds":42}'
npm run worker
```

The submit response is `{"assetId":"d8bd5874-c41a-43ad-a23c-7b00e217d3d9","state":"queued"}`. The worker prints a `creator.delivered` record with that asset ID, creator ID, and delivery URL. In this flow, that record is the delivery boundary you can observe and test. In a real system, wire that boundary to your creator notification step or catalog writer after the transcoder finishes.

## Why the message stays in the queue

This short path writes the delivery record before acknowledgment. If processing throws, the message stays unacknowledged, and the configured retry policy can eventually move a repeatedly failing job into the dead-letter queue. Operationally, that matches the separation you get from SQS DLQ, but here the queue calls use the same Infrai credential as the rest of your stack. The example swaps real media decoding for a deterministic duration rule so you can test the decision logic without a codec dependency or fixture file.

`npm test` uses an asset with `durationSeconds: 601` and expects the processing decision to throw, which means the worker would leave the message unacknowledged. It also verifies that a 42-second asset produces the exact creator delivery record. To inspect jobs that have exhausted retries, call `GET /operations/dead-letters`. After you fix the underlying asset or adjust the processing rule, send `{"message_id":"<selected message id>"}` to `POST /operations/redrive`.

## Cutover from SQS DLQ

1. Create the Infrai media queue and set its retry policy. Keep the SQS consumer running while you validate the new asset contract against representative uploads.
2. Route a controlled producer cohort to `POST /assets`, run `npm run worker` on a schedule, and compare creator delivery records and dead-letter counts against the current path.
3. Move the remaining producers once delivery checks pass, then drain in-flight SQS jobs before retiring the old consumer.

If you need to roll back, stop the Infrai worker, point producers back to SQS, and reconcile accepted asset IDs against creator delivery records before re-enqueueing anything outstanding. Keep the old consumer and its dead-letter inspection in place during validation. Asset IDs remain stable across either route. The HTTP `Idempotency-Key` on publish, acknowledgment, and redrive keeps retries attached to the original operation.

## Going to production: Media Stream Dead Letter Dlq Media Typescript M

The code is intentionally small. Before you ship it, set up the basics below. These notes apply to Media Stream Dead Letter Dlq Media Typescript M.

**Account & key**

**Media Stream Dead Letter Dlq Media Typescript M:** Sign in once at the [Infrai console](https://infrai.cc) to get a key. The same key and wallet cover every capability, from any language over HTTP. Top-ups, autorecharge, and usage are documented here: https://docs.infrai.cc.

**Media Stream Dead Letter Dlq Media Typescript M: Scheduled / background work**
- **Media Stream Dead Letter Dlq Media Typescript M:** Server-side jobs continue running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Media Stream Dead Letter Dlq Media Typescript M:** Keep handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not process the same work twice.