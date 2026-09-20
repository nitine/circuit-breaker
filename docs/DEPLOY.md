# Deploying Circuit Breaker to AWS

One CDK app, two stacks, one command. The result is a CloudFront URL that runs the full drill: Bedrock caller, Transcribe listening, Polly speaking, the Reporter agent filing packets on Lambda.

| Stack | Region | What it holds |
| --- | --- | --- |
| `CircuitBreaker` | ap-south-1 (override with `CB_REGION`) | VPC, ECS Fargate service behind an ALB, CloudFront, DynamoDB, S3, EventBridge bus, Step Functions, the Reporter Lambda, CloudWatch dashboard |
| `CircuitBreakerBilling` | us-east-1 (billing metrics only live there) | Spend alarms at $60, $100 and $140, with an optional email topic |

## 1. Prerequisites

- An AWS account with admin rights for the deploy. Nothing here needs an existing VPC or domain.
- Node 22, Docker running (the app image and the Python Lambda are built as CDK assets).
- AWS CLI credentials in your shell (`aws sts get-caller-identity` works).
- Bedrock model access enabled in the console for the two models you will use (see step 2). Model access is per region.
- A brand-new AWS account returns `AccessDeniedException: Your account is currently being verified` from Bedrock for up to two hours. The app runs in scripted mode until then and picks Bedrock up automatically, no redeploy needed.

## 2. Pick the models and region

Defaults, all overridable with environment variables at deploy time:

| Variable | Default | Used by |
| --- | --- | --- |
| `CB_REGION` | `ap-south-1` | Where the stack lives |
| `BEDROCK_REGION` | same as `CB_REGION` | Bedrock calls. Set to `us-east-1` if Mumbai has no access to your models |
| `BEDROCK_MODEL_ID` | `openai.gpt-oss-120b-1:0` | The caller (red agent). Open-weight, no use-case form. For Claude use `apac.anthropic.claude-sonnet-4-20250514-v1:0` after the Anthropic use-case form is approved |
| `BEDROCK_ANALYST_MODEL_ID` | `amazon.nova-lite-v1:0` | Analyst tagging, world builder, generated pages, Reporter. `global.anthropic.claude-haiku-4-5-20251001-v1:0` once Anthropic is approved |
| `BEDROCK_GUARDRAIL_ID` / `BEDROCK_GUARDRAIL_VERSION` | unset | Optional Guardrail attached to the caller |
| `ALARM_EMAIL` | unset | Billing alarm notifications |

To cut inference cost by roughly 70%, set `BEDROCK_MODEL_ID=amazon.nova-pro-v1:0`. The caller gets noticeably more scripted.

## 3. Deploy

```bash
git clone https://github.com/nitine/circuit-breaker && cd circuit-breaker
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export ALARM_EMAIL=you@example.com            # optional
# export BEDROCK_REGION=us-east-1             # if needed

cd infra && npm install
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/ap-south-1 aws://$CDK_DEFAULT_ACCOUNT/us-east-1
npm run deploy                                # cdk deploy --all, no approval prompts
```

Or from the repo root: `npm run deploy`.

The first deploy takes about 15 minutes, most of it CloudFront. Outputs:

| Output | Meaning |
| --- | --- |
| `Url` | The CloudFront URL. This is the link to submit |
| `AlbUrl` | Direct ALB URL, HTTP only. Useful for debugging, not for the mic (browsers require HTTPS for `getUserMedia`) |
| `TableName`, `BucketName`, `BusName` | The DynamoDB table, packet bucket and event bus |

Open `Url`, start a drill, allow the microphone. The console at the bottom of the drill page shows `caller: Amazon Polly` and `you: Amazon Transcribe` when the pipeline is live.

## 3a. Your own domain (HTTPS without CloudFront)

A domain in a Route 53 hosted zone gives the ALB a certificate and an HTTPS listener, so the mic works without CloudFront:

```bash
aws route53 create-hosted-zone --name circuitbreaker.click --caller-reference cb-1   # paste its 4 nameservers at your registrar
CB_DOMAIN=circuitbreaker.click CB_ZONE_ID=<hosted zone id> CB_EDGE=0 npm run deploy
```

The stack requests the ACM certificate (DNS-validated in the zone), adds the 443 listener, redirects 80 → 443, and creates the apex and `www` aliases. `CB_TLS_PROXY=1` is the no-domain alternative: a t3.micro running Caddy with a Let's Encrypt certificate for `<elastic-ip>.sslip.io`.

## 3b. Fallback caller brain (OpenRouter or Groq)

Bedrock is the first choice. If it refuses (new account, model access pending), the app falls back to any OpenAI-compatible endpoint, and switches back to Bedrock on its own once it answers (`LLM_PROVIDER=auto`). The endpoint and models are plain task environment; the key lives in Secrets Manager.

```bash
# 1. deploy once with the endpoint (defaults: OpenRouter + deepseek/deepseek-v4-flash)
LLM_BASE_URL=https://openrouter.ai/api/v1 LLM_MODEL=deepseek/deepseek-v4-flash LLM_ANALYST_MODEL=deepseek/deepseek-v4-flash npm run deploy

# 2. put the key in the secret the stack created (never in the repo or the task definition)
aws secretsmanager put-secret-value --region ap-south-1 --secret-id circuit-breaker/llm --secret-string '{"LLM_API_KEY":"sk-or-v1-..."}'

# 3. restart the task so it reads the new secret value
aws ecs update-service --region ap-south-1 --cluster <cluster from the console> --service <service> --force-new-deployment
```

Groq: `LLM_BASE_URL=https://api.groq.com/openai/v1 LLM_MODEL=openai/gpt-oss-120b`. Cost on OpenRouter with DeepSeek V4 Flash is about $0.25 per 200 drills.

## 4. What the stack does at runtime

```
browser ──HTTPS/WSS──▶ CloudFront ──▶ ALB ──▶ Fargate task (Node, TanStack Start + Nitro WebSocket)
                                                    │  Bedrock Converse (caller, Analyst, world, pages)
                                                    │  Transcribe streaming (your mic)  ·  Polly (caller voice)
                                                    │  DynamoDB (drill state, 24 h TTL)
                                                    └─ EventBridge `drill.tripped` ──▶ Step Functions Express ──▶ Reporter Lambda (Strands Agent)
                                                                                                                      └─▶ S3 packet ──▶ DynamoDB packet URL ──▶ browser
```

- The Fargate task runs `CB_MODE=aws` with the task role. No access keys are stored anywhere.
- The ALB idle timeout is 3600 s so drill WebSockets stay open; CloudFront forwards the upgrade.
- The health check is `GET /api/health`.
- `DRILL_CAP=200` refuses new drills after 200 in memory; drills expire from DynamoDB after 24 hours.
- The CloudWatch dashboard `circuit-breaker` shows request counts, task CPU and memory, Lambda errors and Bedrock invocations.

## 5. Cost and the $100 budget

Fixed cost while the stack is up is about $1.20/day: one 1 vCPU / 2 GB Fargate task, the ALB, and CloudFront's minimums. Everything else is per drill:

| Per five-minute drill | Rough cost |
| --- | --- |
| Bedrock, Sonnet caller + Haiku analyst | $0.05 to $0.10 |
| Transcribe streaming, 5 min | $0.12 |
| Polly neural, ~1,500 characters | $0.02 |
| Lambda, Step Functions, DynamoDB, S3 | under $0.01 |

So a hundred judge drills is roughly $20 plus the daily fixed cost. The billing alarms at $60, $100 and $140 email you before anything gets close to the credit; pair them with an AWS Budget (`aws budgets create-budget`) at your hard number, since alarms and budgets notify but cannot stop spend.

## 6. Updating

Every push to `main` deploys through GitHub Actions (`.github/workflows/deploy.yml`) using an OIDC role, so no AWS keys live in GitHub. One-time setup: run `infra/scripts/github-oidc.sh` with admin credentials, then `gh variable set DEPLOY_ENABLED --body true`. The workflow reads the domain, edge, alarm and model settings from repository variables (`gh variable list`). Pull requests run typecheck and build only.

Manual alternative:

Push a change, then re-run `npm run deploy` from `infra/`. CDK rebuilds the Docker image, pushes it to ECR and rolls the Fargate service with zero downtime. Only the app or Lambda code that changed is rebuilt.

## 7. Tearing down

```bash
cd infra && npx cdk destroy --all
```

The DynamoDB table and the S3 bucket are set to be removed with the stack (`RemovalPolicy.DESTROY`, bucket auto-delete), so nothing lingers except CloudWatch log groups, which expire after a week.

## 8. Troubleshooting

| Symptom | Check |
| --- | --- |
| `AccessDeniedException` from Bedrock in the task logs | Model access not enabled in `BEDROCK_REGION`, or the model ID is wrong for that region |
| Mic button says "mic blocked" | You opened the ALB URL over HTTP. Use the CloudFront URL |
| Caller speaks, transcript never moves | Transcribe streaming is not available in every region; set `BEDROCK_REGION` and the stack region to one that has it (ap-south-1 does) |
| Drill page shows "reconnecting" | The WebSocket is not upgrading. Confirm you are on the CloudFront URL and the ALB target is healthy (`/api/health`) |
| `cdk deploy` fails building the Lambda | Docker is not running, or cannot pull the `public.ecr.aws/sam/build-python3.12` image |
| Packet stays "Lambda is still writing" | Look at the Step Functions execution and the Reporter Lambda logs; Strands needs Bedrock access in the same region |

Logs: ECS task logs are under `/aws/ecs/...` with stream prefix `drill`; the Lambda under `/aws/lambda/CircuitBreaker-Reporter...`. Both retain for one week.
