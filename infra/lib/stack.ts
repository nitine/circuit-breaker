import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsp from "aws-cdk-lib/aws-ecs-patterns";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as path from "node:path";
import { Construct } from "constructs";

export interface CbProps extends cdk.StackProps {
  bedrockRegion: string; redModel: string; analystModel: string; guardrailId?: string; guardrailVersion?: string;
}

export class CircuitBreakerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CbProps) {
    super(scope, id, props);
    const repoRoot = path.join(__dirname, "..", "..");

    // Data: one table, 24h TTL; one bucket for packets and the corpus copy.
    const table = new ddb.Table(this, "Drills", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const bucket = new s3.Bucket(this, "Packets", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(7) }], removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true,
    });
    new s3deploy.BucketDeployment(this, "CorpusCopy", { sources: [s3deploy.Source.asset(path.join(repoRoot, "corpus"))], destinationBucket: bucket, destinationKeyPrefix: "corpus" });

    // Serverless packet pipeline: EventBridge → Step Functions → Strands Reporter Lambda → S3 → DynamoDB
    const bus = new events.EventBus(this, "Bus", { eventBusName: "circuit-breaker" });
    const reporter = new lambda.Function(this, "Reporter", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.main",
      timeout: cdk.Duration.seconds(90),
      memorySize: 1024,
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", "reporter"), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: ["bash", "-c", "pip install -r requirements.txt -t /asset-output --quiet && cp -au . /asset-output"],
        },
      }),
      environment: { DDB_TABLE: table.tableName, S3_PACKET_BUCKET: bucket.bucketName, BEDROCK_REGION: props.bedrockRegion, BEDROCK_MODEL_ID: props.analystModel },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });
    table.grantReadWriteData(reporter);
    bucket.grantReadWrite(reporter);
    reporter.addToRolePolicy(new iam.PolicyStatement({ actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse", "bedrock:ConverseStream"], resources: ["*"] }));
    const writePacket = new tasks.LambdaInvoke(this, "WritePacket", { lambdaFunction: reporter, outputPath: "$.Payload" });
    const machine = new sfn.StateMachine(this, "PacketPipeline", {
      definitionBody: sfn.DefinitionBody.fromChainable(writePacket.addRetry({ maxAttempts: 2 }).next(new sfn.Succeed(this, "Filed"))),
      stateMachineType: sfn.StateMachineType.EXPRESS,
      timeout: cdk.Duration.minutes(3),
      logs: { destination: new logs.LogGroup(this, "PipelineLogs", { retention: logs.RetentionDays.ONE_WEEK }), level: sfn.LogLevel.ALL },
    });
    new events.Rule(this, "OnTrip", {
      eventBus: bus,
      eventPattern: { source: ["circuit-breaker"], detailType: ["drill.tripped", "drill.ended"] },
      targets: [new targets.SfnStateMachine(machine, { input: events.RuleTargetInput.fromEventPath("$.detail") })],
    });

    // Network: public subnets only, no NAT. Fargate tasks get public IPs.
    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: 0, subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }] });
    const cluster = new ecs.Cluster(this, "Cluster", { vpc, containerInsights: true });
    const service = new ecsp.ApplicationLoadBalancedFargateService(this, "Drill", {
      cluster,
      cpu: 1024, memoryLimitMiB: 2048, desiredCount: 1,
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publicLoadBalancer: true,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(repoRoot, { file: "Dockerfile", platform: undefined }),
        containerPort: 3000,
        logDriver: ecs.LogDrivers.awsLogs({ streamPrefix: "drill", logRetention: logs.RetentionDays.ONE_WEEK }),
        environment: {
          CB_MODE: "aws", NODE_ENV: "production", PORT: "3000",
          AWS_REGION: this.region, BEDROCK_REGION: props.bedrockRegion,
          BEDROCK_MODEL_ID: props.redModel, BEDROCK_ANALYST_MODEL_ID: props.analystModel,
          ...(props.guardrailId ? { BEDROCK_GUARDRAIL_ID: props.guardrailId, BEDROCK_GUARDRAIL_VERSION: props.guardrailVersion ?? "DRAFT" } : {}),
          DDB_TABLE: table.tableName, S3_PACKET_BUCKET: bucket.bucketName, EVENT_BUS_NAME: bus.eventBusName, DRILL_CAP: "200",
        },
      },
    });
    service.targetGroup.configureHealthCheck({ path: "/api/health", interval: cdk.Duration.seconds(30) });
    service.targetGroup.setAttribute("deregistration_delay.timeout_seconds", "15");
    service.loadBalancer.setAttribute("idle_timeout.timeout_seconds", "3600"); // long-lived WebSockets
    const role = service.taskDefinition.taskRole;
    table.grantReadWriteData(role);
    bucket.grantReadWrite(role);
    bus.grantPutEventsTo(role);
    role.addToPrincipalPolicy(new iam.PolicyStatement({ actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse", "bedrock:ConverseStream", "bedrock:ApplyGuardrail"], resources: ["*"] }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({ actions: ["transcribe:StartStreamTranscription", "polly:SynthesizeSpeech"], resources: ["*"] }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({ actions: ["cloudwatch:PutMetricData"], resources: ["*"] }));

    // Edge: CloudFront gives HTTPS (the mic needs a secure origin) and carries the WebSocket.
    const dist = new cloudfront.Distribution(this, "Edge", {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(service.loadBalancer, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY, readTimeout: cdk.Duration.seconds(60), keepaliveTimeout: cdk.Duration.seconds(60) }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    // One dashboard for the latency budget and spend-adjacent counters.
    const dash = new cw.Dashboard(this, "Dashboard", { dashboardName: "circuit-breaker" });
    dash.addWidgets(
      new cw.GraphWidget({ title: "ALB requests / 5xx", left: [service.loadBalancer.metrics.requestCount(), service.loadBalancer.metrics.httpCodeElb(cdk.aws_elasticloadbalancingv2.HttpCodeElb.ELB_5XX_COUNT)] }),
      new cw.GraphWidget({ title: "Fargate CPU / memory", left: [service.service.metricCpuUtilization(), service.service.metricMemoryUtilization()] }),
      new cw.GraphWidget({ title: "Reporter Lambda", left: [reporter.metricInvocations(), reporter.metricErrors(), reporter.metricDuration()] }),
      new cw.GraphWidget({ title: "Packet pipeline", left: [machine.metricStarted(), machine.metricFailed()] }),
    );

    new cdk.CfnOutput(this, "Url", { value: `https://${dist.distributionDomainName}` });
    new cdk.CfnOutput(this, "AlbUrl", { value: `http://${service.loadBalancer.loadBalancerDnsName}` });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "BusName", { value: bus.eventBusName });
  }
}
