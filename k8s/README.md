# Smart EDMS — Kubernetes Deployment

## Overview

This directory contains Kubernetes manifests for deploying Smart EDMS to a
production Kubernetes cluster. The deployment consists of:

| Component | Manifest | Purpose |
|-----------|----------|---------|
| Namespace | `namespace.yaml` | Isolated namespace `smartedms` |
| ConfigMap | `configmap.yaml` | Non-secret configuration |
| Secret | `secret.yaml` | Secret values (NEXTAUTH_SECRET, KEK, etc.) |
| App + Worker | `app.yaml` | Next.js app (2 replicas) + worker (1 replica) + PVC |
| Infrastructure | `infrastructure.yaml` | PostgreSQL + Redis + Ingress + HPA + PDB |
| CronJobs | `cronjobs.yaml` | Hourly cron escalate + billing reconcile |

## Prerequisites

- Kubernetes 1.27+ (or compatible)
- `kubectl` configured
- Ingress controller (nginx-ingress or traefik)
- cert-manager (for TLS certificates) — optional but recommended
- StorageClass for PersistentVolumes

## Quick Start

```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Edit secrets — REPLACE ALL PLACEHOLDER VALUES
#    Generate secrets: openssl rand -hex 32
vim k8s/secret.yaml

# 3. Edit configmap — set NEXTAUTH_URL to your domain
vim k8s/configmap.yaml

# 4. Apply secrets + config
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml

# 5. Apply infrastructure (PostgreSQL + Redis + Ingress)
kubectl apply -f k8s/infrastructure.yaml

# 6. Wait for PostgreSQL + Redis to be ready
kubectl -n smartedms wait --for=condition=ready pod -l app.kubernetes.io/name=postgres --timeout=120s
kubectl -n smartedms wait --for=condition=ready pod -l app.kubernetes.io/name=redis --timeout=60s

# 7. Build and push the Docker image
docker build -t your-registry/smartedms:latest .
docker push your-registry/smartedms:latest

# 8. Update app.yaml with your image reference
sed -i 's|smartedms:latest|your-registry/smartedms:latest|g' k8s/app.yaml

# 9. Apply app + worker
kubectl apply -f k8s/app.yaml

# 10. Apply cron jobs
kubectl apply -f k8s/cronjobs.yaml

# 11. Run database migration
kubectl -n smartedms exec deploy/smartedms-app -- npx prisma migrate deploy

# 12. Seed the database (first deployment only)
kubectl -n smartedms exec deploy/smartedms-app -- npm run seed

# 13. Verify deployment
./scripts/verify-deployment.sh https://smartedms.example.com
```

## Scaling

The app Deployment starts with 2 replicas and auto-scales via the
HorizontalPodAutoscaler (HPA) in `infrastructure.yaml`:

- **Min replicas**: 2 (high availability)
- **Max replicas**: 10
- **Scale up trigger**: CPU > 70% or Memory > 80%
- **Scale down trigger**: CPU < 70% and Memory < 80%

The worker Deployment starts with 1 replica. Scale up for higher job
throughput (OCR, webhooks):

```bash
kubectl -n smartedms scale deploy/smartedms-worker --replicas=3
```

## Managed Services (Recommended for Production)

For production, replace the self-hosted PostgreSQL + Redis StatefulSets
with managed services:

| Component | AWS | GCP | Azure |
|-----------|-----|-----|-------|
| PostgreSQL | RDS for PostgreSQL | Cloud SQL | Azure Database for PostgreSQL |
| Redis | ElastiCache for Redis | Memorystore | Azure Cache for Redis |
| Storage | S3 | Cloud Storage | Blob Storage |
| Ingress | ALB Ingress Controller | GCE Ingress | Application Gateway Ingress |

To use managed services:
1. Delete the StatefulSets + Services from `infrastructure.yaml`
2. Update `configmap.yaml` with the managed service connection strings
3. Update `secret.yaml` with the managed service credentials

## TLS Configuration

TLS is terminated at the Ingress controller via cert-manager:

1. Install cert-manager: https://cert-manager.io/docs/installation/
2. Create a ClusterIssuer for Let's Encrypt:
   ```yaml
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt-prod
   spec:
     acme:
       server: https://acme-v02.api.letsencrypt.org/directory
       email: admin@smartedms.example.com
       privateKeySecretRef:
         name: letsencrypt-prod
       solvers:
         - http01:
             ingress:
               class: nginx
   ```
3. Update the Ingress host in `infrastructure.yaml` to your domain
4. Apply — cert-manager will auto-provision the TLS certificate

## Monitoring

The app exposes Prometheus metrics at `GET /api/metrics` (requires
`METRICS_TOKEN` bearer auth or loopback access). Configure Prometheus
to scrape:

```yaml
- job_name: 'smart-edms'
  scheme: https
  bearer_token: '<METRICS_TOKEN>'
  static_configs:
    - targets: ['smartedms.example.com']
```

## Rollback

```bash
# View deployment history
kubectl -n smartedms rollout history deploy/smartedms-app

# Rollback to previous version
kubectl -n smartedms rollout undo deploy/smartedms-app

# Check rollout status
kubectl -n smartedms rollout status deploy/smartedms-app
```

## Troubleshooting

```bash
# View app logs
kubectl -n smartedms logs -f deploy/smartedms-app

# View worker logs
kubectl -n smartedms logs -f deploy/smartedms-worker

# Check pod status
kubectl -n smartedms get pods

# Check events
kubectl -n smartedms get events --sort-by='.lastTimestamp'

# Execute into pod
kubectl -n smartedms exec -it deploy/smartedms-app -- /bin/bash

# Run database migration
kubectl -n smartedms exec deploy/smartedms-app -- npx prisma migrate deploy

# Check health
kubectl -n smartedms exec deploy/smartedms-app -- curl -s http://localhost:3000/api/health
```
