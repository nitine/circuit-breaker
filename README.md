# Circuit Breaker

**A real-time coercion detection engine for live scams against vulnerable people.**

Every anti-scam product in India watches the phone number. None of them hears the conversation. Circuit Breaker scores a live session for coercion, in real time, and trips a breaker that puts someone you trust between you and the caller.

This repo is the hackathon build: a **drill simulator** where you get scammed, safely. A synthetic caller runs a real playbook against you on a faithful Android or Windows replica, while five agents in a pixel-art control room score the same conversation and trip the breaker. The engine is not mocked. The caller is.

Built for the WeMakeDevs × AWS Bharat Builds Tour, First Commit, 18 to 20 September 2026.

## Run it locally (no AWS account needed)

```bash
git clone https://github.com/nitine/circuit-breaker && cd circuit-breaker/app
npm install
npm run dev          # http://localhost:3000
```

Without AWS credentials the app runs in **local mode**: the caller speaks scripted lines from the corpus, the Analyst uses keyword rules, your browser does speech in and out, and everything lives in memory. The whole drill works end to end.

To run against AWS locally, copy `app/.env.example` to `app/.env` and fill in credentials plus model IDs. With `CB_MODE=aws` the caller is Claude on Bedrock, the Analyst tags coercion with a JSON schema, Transcribe listens, Polly speaks, and the packet pipeline runs on Lambda if the table, bucket and bus are set.

Try a drill without typing: open `/drill/<id>?auto=1` and the judge replies for you.

## Deploy (Ship It)

```bash
cd infra && npm install
export CDK_DEFAULT_ACCOUNT=<account id>
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/ap-south-1 aws://$CDK_DEFAULT_ACCOUNT/us-east-1
npm run deploy      # prints the CloudFront URL
```

Docker must be running. Enable model access for the two Bedrock models first. See `infra/README.md`.

## What runs where

| Rubric row | Service | Job |
| --- | --- | --- |
| Agents and AI | Amazon Bedrock (Claude via Converse, Guardrails); Strands Agents SDK | The caller, the Analyst, the world builder; the Reporter agent that files the 1930 packet |
| Containers | ECS on Fargate, ECR | One Node process: TanStack Start pages, API routes and the drill WebSocket (Nitro) |
| Serverless | Lambda, Step Functions, EventBridge | `drill.tripped` on a bus → Express state machine → Reporter Lambda → S3 → DynamoDB |
| Data and search | DynamoDB, S3 | Drill state with 24 h TTL; packets and the corpus copy |
| The plumbing | CloudFront, EventBridge, CloudWatch | HTTPS for the mic and the WebSocket edge; the bus; dashboard and $60/$80 billing alarms |
| Also | Amazon Transcribe streaming, Amazon Polly | The Listener; the caller's voice and the family line |

The How it works page in the app is this table, interactive: hover any object in the room.

## Layout

```
app/        TanStack Start app
  src/routes/           pages and API file routes
  src/room/             the pixel room: canvas renderer, sprites, store
  src/devices/          One UI and Windows 11 replicas
  server/lib/           engine: analyst, archivist, guardian, red agent, listener, reporter, session
  server/routes/ws.ts   the drill WebSocket (Nitro)
corpus/     five playbooks, four personas, the coercion ontology
infra/      CDK stacks and the Strands Reporter Lambda
docs/PRD.md design/     product spec and the pen.dev wireframes
```

## The engine in one paragraph

Each caller line is tagged with up to three coercion tactics (authority, personalisation, fear, isolation, urgency, control, payment steering, reciprocity). Tactics have weights; repeats within 60 s escalate. Device signals add fixed amounts: a screen-share accepted is +15, a remote-access session +25, an OTP arriving mid-call +12. The sum is the coercion index, monotonic within a session. At 40 the Guardian warns, at 55 nudges, at 70 the lever drops, the caller's audio ducks, and the family member's line plays on the device. Everything the room does is a reaction to one WebSocket event.

## Safety

The caller is fictional, sandboxed with a system prompt and optional Bedrock Guardrails, and never touches real payment rails, real organisations, real numbers or real credentials. No recordings are kept. No real money can move. App names and interfaces are reproduced for realism only; no affiliation with WhatsApp, Google, Microsoft, AnyDesk, PhonePe or any bank.

## Licence

Apache-2.0.
