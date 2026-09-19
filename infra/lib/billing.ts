import * as cdk from "aws-cdk-lib";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import { Construct } from "constructs";

export class BillingAlarmsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps & { thresholds: number[] }) {
    super(scope, id, props);
    const topic = new sns.Topic(this, "BillingTopic");
    const email = process.env.ALARM_EMAIL;
    if (email) topic.addSubscription(new subs.EmailSubscription(email));
    for (const t of props.thresholds) {
      const alarm = new cw.Alarm(this, `Spend${t}`, {
        metric: new cw.Metric({ namespace: "AWS/Billing", metricName: "EstimatedCharges", dimensionsMap: { Currency: "USD" }, statistic: "Maximum", period: cdk.Duration.hours(6) }),
        threshold: t, evaluationPeriods: 1, comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        alarmDescription: `Circuit Breaker spend passed $${t}`,
      });
      alarm.addAlarmAction(new actions.SnsAction(topic));
    }
  }
}
