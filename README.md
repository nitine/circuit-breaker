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

Without AWS credentials the app runs in **local mode** and still does the whole drill end to end: the caller talks, listens, reacts to what you do on the device, and the room scores it. Three optional installs make local mode fully live:

```bash
tools/piper/install.sh   # Piper voices (en + hi) for the caller, Vosk models so your mic works in any browser  (~350 MB)
tools/llm/install.sh     # llama.cpp + Qwen2.5-3B-Instruct so the caller improvises instead of reading the playbook  (~2 GB)
tools/llm/serve.sh       # start the local model on :8081, then set LLM_BASE_URL / LLM_MODEL in app/.env (see .env.example)
```

To run against AWS locally, copy `app/.env.example` to `app/.env` and fill in credentials plus model IDs. With `CB_MODE=aws` the caller is Claude on Bedrock, the Analyst tags coercion with a JSON schema, Transcribe listens, Polly speaks, and the packet pipeline runs on Lambda if the table, bucket and bus are set.

Try a drill without typing: open `/drill/<id>?auto=1` and the judge replies for you.

### The voice pipeline, and how the AI works in each mode

Both parties talk. The caller speaks; you answer by voice or by typing. The mic is captured in the browser as 16 kHz PCM and streamed over the drill WebSocket, so speech recognition never depends on the browser vendor.

| | AWS mode (keys set) | Local mode |
| --- | --- | --- |
| The caller's brain | Claude on Bedrock, improvising inside the playbook and reacting to every device action | Any OpenAI-compatible model (`tools/llm/serve.sh` runs Qwen2.5-3B on llama.cpp); without one, playbook lines with resist branches |
| The caller's voice | Amazon Polly (English and Hindi voices) | Piper neural TTS (English and Hindi voices); else the browser's own voices; else captions |
| Your voice | Amazon Transcribe streaming, en-IN or hi-IN | Vosk on the server (en-IN and Hindi models, streamed from your mic); else Chrome's speech recognition; else type |
| The Analyst | Claude Haiku tagging tactics with a JSON schema, keyword rules as a belt and braces | Keyword rules per tactic, English and Hindi |
| The world builder | Claude builds the persona's phone: contacts, chats, mails, bank, hook SMS | Templates per persona (or the local model, if running) |
| The pages the caller sends | Claude rewrites a base HTML template per drill | The base template, rendered in a sandboxed frame |

Every page the scammer "sends" (the RBI verification form, the AnyDesk installer, the refund portal, the onboarding form) is generated UI: a base template in `corpus/ui/` with a tiny bridge script, rewritten by the model per drill, rendered in a sandboxed iframe inside the phone or laptop. Its buttons post back as device events, so the caller reacts to what you clicked.

**Deployed**, the site sits behind CloudFront over HTTPS, so the mic permission works and the voice pipeline is Transcribe → Bedrock → Polly. Ring tones, notification chimes and the scare-page siren are synthesized in the browser and work everywhere.

**Language.** The picker offers English and Hindi. Hindi switches the Listener to hi-IN (Transcribe or Vosk), the caller's voice to a Hindi voice (Polly or Piper), and the caller's lines to Devanagari Hinglish.

## Deploy (Ship It)

```bash
cd infra && npm install
export CDK_DEFAULT_ACCOUNT=<account id>
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/ap-south-1 aws://$CDK_DEFAULT_ACCOUNT/us-east-1
npm run deploy      # prints the CloudFront URL
```

Docker must be running. Enable model access for the two Bedrock models first. The full guide, with model and region options, cost per drill, updating, teardown and troubleshooting, is in [docs/DEPLOY.md](docs/DEPLOY.md).

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
  src/room/             the room: generated render as background, keyed sprites, overlays, store
  public/room/          room.png and the ten character sprites (generated, green-keyed with tools/key_sprites.py)
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
