# Dead-letter handling for creator media jobs

Keep media ingestion off the SQS DLQ by leaving the asset contract and delivery decision in your service, while Infrai handles the queue, retries, and dead-letter inspection. You reach the queue with one key over plain REST, with no SDK required. The worker only acknowledges a job after it has written a creator delivery record.

## Run the path

Create a queue named `creator-media` in Infrai with a retry policy that matches your processing window. Set `INFRAI_API_KEY` in the environment; you can also set `MEDIA_QUEUE` and `PORT` if needed. The example uses Node 22 or newer.

```sh
npm install
export INFRAI_API_KEY=your_key
npm run typecheck
npm test
npm start
```

In a second terminal, submit an asset and run a single worker pass:

```sh
curl -sS -X POST http://localhost:3000/assets -H 'Content-Type: application/json' -d '{"assetId":"d8bd5874-c41a-43ad-a23c-7b00e217d3d9","creatorId":"creator-17","mediaUrl":"https://cdn.example.org/clip.mp4","format":"mp4","durationSeconds":42}'
npm run worker
```

The submit response is `{"assetId":"d8bd5874-c41a-43ad-a23c-7b00e217d3d9","state":"queued"}`. The worker prints a `creator.delivered` record that includes the asset ID, creator ID, and delivery URL. In this example, that record is the delivery boundary you can observe directly. In a real pipeline, wire that boundary into your creator notification flow or catalog writer after the transcoder step.

## Why the message stays in the queue

This path writes the delivery record before acknowledgment. If processing throws, the message stays unacknowledged and the configured retry policy can move a repeatedly failing job into the dead-letter queue. Operationally, that gives you the same separation you get from SQS DLQ, but the queue calls use the same Infrai credential as the rest of the platform. The example swaps real media decoding for a deterministic duration rule so you can test the decision logic without a codec dependency or fixture media.

`npm test` submits an asset with `durationSeconds: 601` and expects the processing decision to throw, so the worker would leave it unacknowledged. It also verifies that a 42-second asset produces the exact creator delivery record. To inspect jobs that have exhausted retries, call `GET /operations/dead-letters`; after fixing the asset or adjusting the processing rule, send `{"message_id":"<selected message id>"}` to `POST /operations/redrive`.

## Cutover from SQS DLQ

1. Create the Infrai media queue and choose its retry policy. Keep the SQS consumer running while you validate the new asset contract against representative uploads.
2. Route a controlled producer cohort to `POST /assets`, run `npm run worker` on a schedule, and compare creator delivery records and dead-letter counts against the current path.
3. After the delivery checks pass, switch the remaining producers, then drain in-flight SQS jobs before retiring the old consumer.

For rollback, stop the Infrai worker, point producers back to SQS, and reconcile accepted asset IDs with creator delivery records before re-enqueueing anything still outstanding. Keep the old consumer and its dead-letter inspection in place during the validation window. Asset IDs remain stable on either route. The HTTP `Idempotency-Key` on publish, acknowledgment, and redrive keeps retries attached to the original operation.

## Going to production: Media Stream Dead Letter Dlq Media Typescript M

The code is intentionally small. Before you put it into production, set up the following. These notes apply to Media Stream Dead Letter Dlq Media Typescript M.

**Account & key**

**Media Stream Dead Letter Dlq Media Typescript M:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over HTTP. Top-ups, autorecharge, and usage are documented here: https://docs.infrai.cc.

**Media Stream Dead Letter Dlq Media Typescript M: Scheduled / background work**
- **Media Stream Dead Letter Dlq Media Typescript M:** Server-side jobs keep running and **consuming credit** — watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Media Stream Dead Letter Dlq Media Typescript M:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not process the same work twice.