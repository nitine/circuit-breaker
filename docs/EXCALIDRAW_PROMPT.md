# Excalidraw prompt: Circuit Breaker architecture

Paste the block below into Excalidraw's text-to-diagram (or any AI diagram generator). The node list matches the Mermaid diagram in the README, so the two stay in step.

```
Draw a clean left-to-right architecture diagram titled "Circuit Breaker", a real-time coercion detection engine delivered as a scam drill simulator. Use rounded rectangles, thin arrows with short labels, sans-serif text, and generous spacing. Group boxes into four labelled containers arranged left to right.

Container 1, "Browser", dark background (#1f1f1f) with white text. Two boxes: "Device replica: One UI or Windows 11, generated pages in a sandboxed iframe" and "Control room: pixel-art canvas".

Container 2, a single box "CloudFront: HTTPS and WSS", orange border (#ff9900), white fill.

Container 3, "ECS Fargate behind an ALB: one Node process", light grey fill (#f4f4f4), orange border. Inside it: a box "Drill WebSocket: TanStack Start + Nitro", a box "Caller (red agent)" in pale red (#fde2e2), and a nested container "The room" in warm brown (#8b5a2b border) with cream fill (#fff4dc) holding five small boxes in a row: "Listener: hears the judge", "Analyst: tags tactics", "Archivist: files moves and pages", "Guardian: holds the lever", "Reporter: files the packet".

Container 4, "AWS services", white fill, orange border (#ff9900), orange header text. Boxes: "Amazon Transcribe: streaming, en-IN or hi-IN", "Amazon Polly: caller and family voices", "Amazon Bedrock: Converse API, gpt-oss-120b and Nova Lite", a cylinder "DynamoDB: drill state, 24 h TTL", "EventBridge: drill.tripped", "Step Functions Express", "Reporter Lambda: Strands Agents SDK", a cylinder "S3: 1930 packet", and "CloudWatch: dashboard and billing alarms".

Arrows, all with labels:
- Device replica <-> CloudFront, label "mic PCM, device events, audio"
- Control room <-> CloudFront, label "room events"
- CloudFront <-> Drill WebSocket
- Drill WebSocket -> Caller
- Drill WebSocket -> The room
- Caller -> Amazon Bedrock, label "improvise, build the world, rewrite pages"
- Caller -> Amazon Polly
- Listener -> Amazon Transcribe
- Analyst -> Amazon Bedrock, label "tag tactics, JSON schema"
- Archivist -> DynamoDB
- Guardian -> Amazon Polly, label "family line"
- Reporter -> EventBridge -> Step Functions Express -> Reporter Lambda
- Reporter Lambda -> Amazon Bedrock
- Reporter Lambda -> S3
- Reporter Lambda -> DynamoDB, label "packet URL"
- Fargate container -> CloudWatch, dashed arrow

Place the EventBridge, Step Functions, Lambda and S3 boxes in one horizontal chain at the bottom of the AWS container so the packet pipeline reads as a single line. Put Transcribe, Polly and Bedrock at the top so the voice and model arrows from the room stay short and do not cross.

Add a legend in the bottom-left corner with four swatches: dark = browser, orange border = AWS managed service, warm brown and cream = the five agents in the room, pale red = the synthetic caller. Add one caption under the diagram: "The engine is not mocked. The caller is."
```
