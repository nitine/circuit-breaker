const env = process.env;
const hasCreds = Boolean(
  env.AWS_ACCESS_KEY_ID || env.AWS_PROFILE || env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
  env.AWS_CONTAINER_CREDENTIALS_FULL_URI || env.AWS_WEB_IDENTITY_TOKEN_FILE || env.ECS_CONTAINER_METADATA_URI_V4,
);
const mode = (env.CB_MODE === "aws" || env.CB_MODE === "local") ? env.CB_MODE : (hasCreds ? "aws" : "local");

export const cfg = {
  mode,
  isAws: mode === "aws",
  region: env.AWS_REGION ?? "ap-south-1",
  bedrockRegion: env.BEDROCK_REGION ?? env.AWS_REGION ?? "ap-south-1",
  redModel: env.BEDROCK_MODEL_ID ?? "apac.anthropic.claude-sonnet-4-20250514-v1:0",
  analystModel: env.BEDROCK_ANALYST_MODEL_ID ?? env.BEDROCK_MODEL_ID ?? "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  guardrailId: env.BEDROCK_GUARDRAIL_ID,
  guardrailVersion: env.BEDROCK_GUARDRAIL_VERSION ?? "DRAFT",
  pollyVoiceEn: env.POLLY_VOICE_EN ?? "Kajal",
  pollyVoiceHi: env.POLLY_VOICE_HI ?? "Kajal",
  pollyEngine: env.POLLY_ENGINE ?? "neural",
  transcribeEnabled: env.TRANSCRIBE_ENABLED !== "false",
  pollyEnabled: env.POLLY_ENABLED !== "false",
  bedrockEnabled: env.BEDROCK_ENABLED !== "false",
  ddbTable: env.DDB_TABLE,
  s3Bucket: env.S3_PACKET_BUCKET,
  eventBus: env.EVENT_BUS_NAME,
  drillCap: Number(env.DRILL_CAP ?? 200),
  tripThresholdOverride: env.TRIP_THRESHOLD ? Number(env.TRIP_THRESHOLD) : undefined,
};

export function features() {
  return {
    transcribe: cfg.isAws && cfg.transcribeEnabled,
    polly: cfg.isAws && cfg.pollyEnabled,
    bedrock: cfg.isAws && cfg.bedrockEnabled,
  };
}
