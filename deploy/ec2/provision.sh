#!/usr/bin/env bash
# Create the one EC2 instance, its key pair, and its security group.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
source_aws_credentials

account_id="$(aws_cmd sts get-caller-identity --query Account --output text)"
[[ "$account_id" == "094304803614" ]] || {
  echo "Refusing to provision in unexpected AWS account: ${account_id}" >&2
  exit 1
}

my_public_ip="${MY_PUBLIC_IP:-$(curl -4fsS https://checkip.amazonaws.com | tr -d '[:space:]')}"
[[ "$my_public_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || {
  echo "MY_PUBLIC_IP must be an IPv4 address, got: ${my_public_ip}" >&2
  exit 1
}

vpc_id="$(aws_cmd ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)"
[[ -n "$vpc_id" && "$vpc_id" != "None" ]] || {
  echo "No default VPC is available in ${AWS_REGION}. This script does not create networking." >&2
  exit 1
}

sg_id="$(aws_cmd ec2 describe-security-groups \
  --filters "Name=group-name,Values=${SECURITY_GROUP_NAME}" "Name=vpc-id,Values=${vpc_id}" \
  --query 'SecurityGroups[0].GroupId' --output text)"
if [[ -z "$sg_id" || "$sg_id" == "None" ]]; then
  sg_id="$(aws_cmd ec2 create-security-group --group-name "$SECURITY_GROUP_NAME" \
    --description 'Portfolio Support Copilot single-instance demo' --vpc-id "$vpc_id" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${SECURITY_GROUP_NAME}},{Key=Project,Value=${PROJECT_TAG}}]" \
    --query GroupId --output text)"
fi

# This deployment-owned group must expose exactly SSH from this machine and HTTP on 8000.
existing_rules="$(aws_cmd ec2 describe-security-groups --group-ids "$sg_id" \
  --query 'SecurityGroups[0].IpPermissions' --output json)"
if [[ "$existing_rules" != "[]" ]]; then
  aws_cmd ec2 revoke-security-group-ingress --group-id "$sg_id" --ip-permissions "$existing_rules"
fi
permissions="$(python3 - "$my_public_ip" <<'PY'
import json
import sys

ip = sys.argv[1]
print(json.dumps([
    {"IpProtocol": "tcp", "FromPort": 22, "ToPort": 22,
     "IpRanges": [{"CidrIp": f"{ip}/32", "Description": "SSH from deploy machine"}]},
    {"IpProtocol": "tcp", "FromPort": 8000, "ToPort": 8000,
     "IpRanges": [{"CidrIp": "0.0.0.0/0", "Description": "Portfolio Support Copilot console"}]},
]))
PY
)"
aws_cmd ec2 authorize-security-group-ingress --group-id "$sg_id" --ip-permissions "$permissions"

if aws_cmd ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
  [[ -f "$KEY_PATH" ]] || {
    echo "AWS key pair ${KEY_NAME} exists but ${KEY_PATH} is missing; run teardown or restore the key." >&2
    exit 1
  }
else
  mkdir -p "${HOME}/.aws"
  if [[ -f "$KEY_PATH" ]]; then
    aws_cmd ec2 import-key-pair --key-name "$KEY_NAME" \
      --public-key-material "$(ssh-keygen -y -f "$KEY_PATH")" >/dev/null
  else
    temp_key="$(mktemp "${HOME}/.aws/${KEY_NAME}.XXXXXX")"
    trap 'rm -f "$temp_key"' EXIT
    umask 077
    aws_cmd ec2 create-key-pair --key-name "$KEY_NAME" --query KeyMaterial --output text >"$temp_key"
    chmod 600 "$temp_key"
    mv "$temp_key" "$KEY_PATH"
    trap - EXIT
  fi
fi
chmod 600 "$KEY_PATH"

id="$(instance_id)"
if [[ -n "$id" && "$id" != "None" ]]; then
  if [[ "$id" == *$'\t'* || "$id" == *' '* ]]; then
    echo "More than one active ${INSTANCE_NAME} instance exists: ${id}" >&2
    exit 1
  fi
  state="$(aws_cmd ec2 describe-instances --instance-ids "$id" \
    --query 'Reservations[0].Instances[0].State.Name' --output text)"
  if [[ "$state" == "stopped" ]]; then
    aws_cmd ec2 start-instances --instance-ids "$id" >/dev/null
  fi
else
  ami_id="$(aws_cmd ssm get-parameter \
    --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
    --query 'Parameter.Value' --output text)"
  id="$(aws_cmd ec2 run-instances --image-id "$ami_id" --instance-type "${INSTANCE_TYPE:-t3.small}" \
    --key-name "$KEY_NAME" --security-group-ids "$sg_id" --associate-public-ip-address \
    --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,DeleteOnTermination=true}' \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${INSTANCE_NAME}},{Key=Project,Value=${PROJECT_TAG}}]" "ResourceType=volume,Tags=[{Key=Project,Value=${PROJECT_TAG}}]" \
    --query 'Instances[0].InstanceId' --output text)"
fi

aws_cmd ec2 wait instance-running --instance-ids "$id"
aws_cmd ec2 wait instance-status-ok --instance-ids "$id"
public_ip="$(aws_cmd ec2 describe-instances --instance-ids "$id" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
printf 'Provisioned %s (%s) at http://%s:8000\n' "$id" "${INSTANCE_TYPE:-t3.small}" "$public_ip"
