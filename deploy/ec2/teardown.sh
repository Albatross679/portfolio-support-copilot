#!/usr/bin/env bash
# Terminate the demo instance and delete all AWS resources created by provision.sh.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
source_aws_credentials

id="$(instance_id)"
if [[ -n "$id" && "$id" != "None" ]]; then
  if [[ "$id" == *$'\t'* || "$id" == *' '* ]]; then
    echo "Refusing teardown: more than one active ${INSTANCE_NAME} instance exists: ${id}" >&2
    exit 1
  fi
  aws_cmd ec2 terminate-instances --instance-ids "$id" >/dev/null
  aws_cmd ec2 wait instance-terminated --instance-ids "$id"
fi

vpc_id="$(aws_cmd ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)"
if [[ -n "$vpc_id" && "$vpc_id" != "None" ]]; then
  sg_id="$(aws_cmd ec2 describe-security-groups \
    --filters "Name=group-name,Values=${SECURITY_GROUP_NAME}" "Name=vpc-id,Values=${vpc_id}" \
    --query 'SecurityGroups[0].GroupId' --output text)"
  if [[ -n "$sg_id" && "$sg_id" != "None" ]]; then
    aws_cmd ec2 delete-security-group --group-id "$sg_id"
  fi
fi

if aws_cmd ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
  aws_cmd ec2 delete-key-pair --key-name "$KEY_NAME"
fi
rm -f "$KEY_PATH"
printf 'Deleted the Portfolio Support Copilot EC2 demo resources in %s.\n' "$AWS_REGION"
