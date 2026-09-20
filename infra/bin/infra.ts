#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CircuitBreakerStack } from "../lib/stack";
import { BillingAlarmsStack } from "../lib/billing";

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
new CircuitBreakerStack(app, "CircuitBreaker", {
  env: { account, region: process.env.CB_REGION ?? "ap-south-1" },
  bedrockRegion: process.env.BEDROCK_REGION ?? process.env.CB_REGION ?? "ap-south-1",
  redModel: process.env.BEDROCK_MODEL_ID ?? "openai.gpt-oss-120b-1:0",
  analystModel: process.env.BEDROCK_ANALYST_MODEL_ID ?? "amazon.nova-lite-v1:0",
  guardrailId: process.env.BEDROCK_GUARDRAIL_ID,
  guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION,
  edge: process.env.CB_EDGE !== "0",
});
// Billing metrics only exist in us-east-1.
new BillingAlarmsStack(app, "CircuitBreakerBilling", { env: { account, region: "us-east-1" }, thresholds: [60, 100, 140] });
