# Circuit Breaker

**A real-time coercion detection engine for live scams against vulnerable people.**

Every anti-scam product in India watches the phone number. None of them hears the conversation. Circuit Breaker scores a live session for coercion, in real time, and trips a breaker that puts a family member between the victim and the scammer.

This repo is the hackathon build: a **drill simulator** where you get scammed, safely. A synthetic scammer runs a real playbook against you on a simulated Android phone or Windows laptop. Five agents in a pixel-art control room score the same conversation and trip the breaker. The engine is not mocked. The scammer is.

Built on AWS for the WeMakeDevs Bharat Builds Tour, First Commit hackathon, 18 to 20 September 2026.

## What's here

| Path | What it is |
| --- | --- |
| `docs/PRD.md` | The product requirements document: thesis, experience, personas, the engine, the red agent, device simulation, AWS architecture, data model, build plan, risks |
| `design/circuit-breaker.pen` | Wireframes and the room concept, as a pen.dev design file |
| `design/images/` | The generated room reference render the wireframes use |

Code lands in `engine/`, `room/`, `device-android/`, `device-windows/`, `red-agent/`, `corpus/` and `infra/` as it is built.

## The room

One pixel-art control room, built once as a state machine. Every page of the site is a state of it. The device you get scammed on is an object on the desk. Every object in the room is an AWS service: the headphones desk is Transcribe, the cork board is Bedrock, the filing cabinet is a Knowledge Base, the phone booth is Step Functions and Connect, the printer is a Strands agent writing to S3.

## Safety

The scammer is fictional, sandboxed with Bedrock Guardrails, and never touches real payment rails, real organisations, real numbers or real credentials. No recordings are kept. No real money can move.

## Licence

Apache-2.0.
