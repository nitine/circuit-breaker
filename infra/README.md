# infra

CDK stack for Circuit Breaker. Two stacks: `CircuitBreaker` in ap-south-1 (everything) and `CircuitBreakerBilling` in us-east-1 (spend alarms at $60 and $80).

```bash
cd infra && npm install
export CDK_DEFAULT_ACCOUNT=<account id>
export ALARM_EMAIL=you@example.com        # optional, for the billing alarms
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/ap-south-1 aws://$CDK_DEFAULT_ACCOUNT/us-east-1
npm run deploy
```

Needs Docker running: the app image and the Reporter Lambda (Python, Strands Agents SDK) are built as assets. The `Url` output is the CloudFront URL to submit. First deploy takes about 15 minutes, mostly CloudFront.

Model IDs and the Guardrail come from `BEDROCK_MODEL_ID`, `BEDROCK_ANALYST_MODEL_ID`, `BEDROCK_GUARDRAIL_ID`, `BEDROCK_GUARDRAIL_VERSION` at deploy time. Enable model access for the two models in the Bedrock console first.
