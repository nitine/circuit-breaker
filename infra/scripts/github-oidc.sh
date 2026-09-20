#!/usr/bin/env bash
# One-time: lets GitHub Actions deploy the CDK stacks from main without any AWS keys stored in GitHub.
# Creates the GitHub OIDC identity provider and a role that may only assume CDK's bootstrap roles.
set -euo pipefail
ACC=$(aws sts get-caller-identity --query Account --output text)
REPO="${1:-nitine/circuit-breaker}"
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750732ffd97d9cc 2>/dev/null || echo "oidc provider already exists"
cat > /tmp/gh-trust.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"arn:aws:iam::$ACC:oidc-provider/token.actions.githubusercontent.com"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com"},"StringLike":{"token.actions.githubusercontent.com:sub":"repo:$REPO:ref:refs/heads/main"}}}]}
JSON
aws iam create-role --role-name circuit-breaker-github-deploy --assume-role-policy-document file:///tmp/gh-trust.json --description "GitHub Actions deploys the Circuit Breaker CDK stacks from main" >/dev/null 2>&1 || echo "role already exists"
cat > /tmp/gh-perm.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"sts:AssumeRole","Resource":"arn:aws:iam::$ACC:role/cdk-hnb659fds-*"},{"Effect":"Allow","Action":["cloudformation:DescribeStacks","ecr:GetAuthorizationToken","sts:GetCallerIdentity"],"Resource":"*"}]}
JSON
aws iam put-role-policy --role-name circuit-breaker-github-deploy --policy-name cdk-deploy --policy-document file:///tmp/gh-perm.json
echo "done. now: gh variable set DEPLOY_ENABLED --body true"
