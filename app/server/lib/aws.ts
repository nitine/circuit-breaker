import { cfg } from "./config";

let _bedrock: import("@aws-sdk/client-bedrock-runtime").BedrockRuntimeClient | undefined;
let _polly: import("@aws-sdk/client-polly").PollyClient | undefined;
let _transcribe: import("@aws-sdk/client-transcribe-streaming").TranscribeStreamingClient | undefined;
let _ddb: import("@aws-sdk/lib-dynamodb").DynamoDBDocumentClient | undefined;
let _s3: import("@aws-sdk/client-s3").S3Client | undefined;
let _eb: import("@aws-sdk/client-eventbridge").EventBridgeClient | undefined;

export async function bedrock() {
  if (!_bedrock) {
    const { BedrockRuntimeClient } = await import("@aws-sdk/client-bedrock-runtime");
    _bedrock = new BedrockRuntimeClient({ region: cfg.bedrockRegion });
  }
  return _bedrock;
}
export async function polly() {
  if (!_polly) {
    const { PollyClient } = await import("@aws-sdk/client-polly");
    _polly = new PollyClient({ region: cfg.region });
  }
  return _polly;
}
export async function transcribe() {
  if (!_transcribe) {
    const { TranscribeStreamingClient } = await import("@aws-sdk/client-transcribe-streaming");
    _transcribe = new TranscribeStreamingClient({ region: cfg.region });
  }
  return _transcribe;
}
export async function ddb() {
  if (!_ddb) {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    _ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: cfg.region }), { marshallOptions: { removeUndefinedValues: true } });
  }
  return _ddb;
}
export async function s3() {
  if (!_s3) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    _s3 = new S3Client({ region: cfg.region });
  }
  return _s3;
}
export async function eventbridge() {
  if (!_eb) {
    const { EventBridgeClient } = await import("@aws-sdk/client-eventbridge");
    _eb = new EventBridgeClient({ region: cfg.region });
  }
  return _eb;
}

/** One Bedrock Converse call. Returns the text of the first content block. */
export async function converse(opts: {
  modelId: string;
  system: string;
  messages: { role: "user" | "assistant"; text: string }[];
  maxTokens?: number;
  temperature?: number;
  guardrail?: boolean;
}): Promise<string> {
  const client = await bedrock();
  const { ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const res = await client.send(
    new ConverseCommand({
      modelId: opts.modelId,
      system: [{ text: opts.system }],
      messages: opts.messages.map((m) => ({ role: m.role, content: [{ text: m.text }] })),
      inferenceConfig: { maxTokens: opts.maxTokens ?? 300, temperature: opts.temperature ?? 0.7 },
      ...(opts.guardrail && cfg.guardrailId
        ? { guardrailConfig: { guardrailIdentifier: cfg.guardrailId, guardrailVersion: cfg.guardrailVersion } }
        : {}),
    }),
  );
  const block = res.output?.message?.content?.find((c) => "text" in c);
  return (block && "text" in block ? block.text : "") ?? "";
}
