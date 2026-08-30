# EC2 demo deployment

This stage-one deployment runs the repository's existing Docker Compose stack on one public Ubuntu 24.04 EC2 instance in `us-east-2`. It creates one `t3.small` instance with a 20 GB gp3 root disk, one security group, and one EC2 key pair. It does not create a load balancer, domain, Elastic IP, RDS, ElastiCache, or any other AWS service.

## Prerequisites

Run the scripts from the repository root on the deploy machine. They load `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `OPENROUTER_API_KEY` from `~/.zshrc`; those values never enter the repository. The scripts invoke AWS CLI through `uv tool run --from awscli aws`, so no system-wide AWS CLI installation is required. Install `uv`, `curl`, `rsync`, `ssh`, and `scp` locally.

The EC2 private key is generated at `~/.aws/portfolio-support-copilot-ec2.pem` with mode `0600`. Never add it to Git. SSH access is limited to the public IPv4 address detected from the machine running `provision.sh`; set `MY_PUBLIC_IP=x.x.x.x` if automatic detection is unsuitable.

## Provision and deploy

```bash
./deploy/ec2/provision.sh
./deploy/ec2/deploy.sh
```

`provision.sh` is idempotent for its named resources and prints the public URL. `deploy.sh` re-syncs the current worktree without `.git`, `.env`, virtualenvs, caches, or `node_modules`, installs Docker Engine plus the Compose plugin, transfers a fresh instance-only `.env` with the OpenRouter key, and runs `sudo docker compose up -d --build`. It also verifies that the one-time `init` container exits with code zero after schema setup, seed data, LangGraph checkpoint setup, and help-document embeddings.

To update the running demo after a code change, run:

```bash
./deploy/ec2/deploy.sh
```

The console and API are public at `http://<public-ip>:8000`. The security group exposes only TCP 8000 publicly and TCP 22 from the deployment machine's detected IPv4 address. This demo has no application authentication, so destroy it when it is no longer needed.

## Verify

Use the public URL to load the console, submit a policy question, and submit `My damaged 4K order ORD-1001 needs a refund.`. Poll the run endpoint or open the Approval inbox; the policy question should complete and the refund should reach `awaiting_approval` without approving it.

## Cost and teardown

A `t3.small` with a 20 GB gp3 root volume in `us-east-2` is roughly $15 to $20 per month if left running, before any data-transfer or OpenRouter usage. Stop charges completely and remove the key material with:

```bash
./deploy/ec2/teardown.sh
```

The teardown script terminates the named instance, waits for termination so its delete-on-termination root volume is removed, deletes the deployment security group and key pair, and removes the local private key.
