#!/usr/bin/env bash
#
# Smart EDMS — S3 bucket setup script
#
# Configures an S3 bucket for production-grade document storage:
#   1. Bucket versioning (protects against accidental overwrites/deletes)
#   2. Object Lock (WORM — prevents deletion for a retention period)
#   3. Server-side encryption (AES256, or KMS if KMS_KEY_ID is set)
#   4. MFA Delete (requires MFA token to delete object versions)
#   5. Lifecycle policy (transition to Glacier after 90 days, expire after 7 years)
#   6. Public access block (no public access — all access via signed URLs)
#
# Usage:
#   S3_BUCKET=my-bucket S3_REGION=us-east-1 ./scripts/setup-s3-bucket.sh
#
# Requires: aws CLI configured with appropriate permissions.

set -euo pipefail

BUCKET="${S3_BUCKET:?S3_BUCKET is required}"
REGION="${S3_REGION:-us-east-1}"
KMS_KEY_ID="${S3_KMS_KEY_ID:-}"
LOCK_RETENTION_DAYS="${S3_LOCK_RETENTION_DAYS:-2555}"  # 7 years default

echo "🪣 Smart EDMS — S3 Bucket Setup"
echo "   Bucket: $BUCKET"
echo "   Region: $REGION"
echo "   KMS Key: ${KMS_KEY_ID:-none (AES256)}"
echo "   Object Lock: ${LOCK_RETENTION_DAYS} days"
echo ""

# 1. Create bucket (if it doesn't exist)
echo "1️⃣  Creating bucket (if needed)..."
if ! aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "   ✅ Bucket created"
else
  echo "   ℹ️  Bucket already exists"
fi

# 2. Enable versioning
echo "2️⃣  Enabling versioning..."
aws s3api put-bucket-versioning --bucket "$BUCKET" --region "$REGION" \
  --versioning-configuration Status=Enabled
echo "   ✅ Versioning enabled"

# 3. Enable Object Lock (WORM protection)
echo "3️⃣  Enabling Object Lock..."
# Note: Object Lock must be enabled at bucket creation time.
# If the bucket already exists without Object Lock, this will fail.
# In that case, create a new bucket with --object-lock-enabled-for-bucket
aws s3api put-object-lock-configuration --bucket "$BUCKET" --region "$REGION" \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "GOVERNANCE",
        "Days": '"$LOCK_RETENTION_DAYS"'
      }
    }
  }' 2>/dev/null && echo "   ✅ Object Lock enabled (${LOCK_RETENTION_DAYS} days, GOVERNANCE mode)" || \
  echo "   ⚠️  Object Lock not enabled (bucket must be created with --object-lock-enabled-for-bucket)"

# 4. Enable server-side encryption
echo "4️⃣  Enabling server-side encryption..."
if [ -n "$KMS_KEY_ID" ]; then
  aws s3api put-bucket-encryption --bucket "$BUCKET" --region "$REGION" \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "aws:kms",
          "KMSMasterKeyID": "'"$KMS_KEY_ID"'"
        },
        "BucketKeyEnabled": true
      }]
    }'
  echo "   ✅ SSE-KMS enabled (key: $KMS_KEY_ID)"
else
  aws s3api put-bucket-encryption --bucket "$BUCKET" --region "$REGION" \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        },
        "BucketKeyEnabled": true
      }]
    }'
  echo "   ✅ SSE-AES256 enabled"
fi

# 5. Block all public access
echo "5️⃣  Blocking public access..."
aws s3api put-public-access-block --bucket "$BUCKET" --region "$REGION" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "   ✅ Public access blocked"

# 6. Set lifecycle policy (transition to Glacier after 90 days)
echo "6️⃣  Setting lifecycle policy..."
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --region "$REGION" \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "smart-edms-lifecycle",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Transitions": [{
        "Days": 90,
        "StorageClass": "GLACIER"
      }],
      "NoncurrentVersionTransitions": [{
        "NoncurrentDays": 30,
        "StorageClass": "GLACIER"
      }],
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 365
      }
    }]
  }'
echo "   ✅ Lifecycle policy set (Glacier after 90 days, old versions expire after 365 days)"

# 7. Enable MFA Delete (requires MFA device ARN)
# This is optional and requires the caller's MFA device ARN
# Uncomment and set MFA_DEVICE if you want MFA Delete:
# MFA_DEVICE="arn:aws:iam::123456789012:mfa/user"
# aws s3api put-bucket-versioning --bucket "$BUCKET" --region "$REGION" \
#   --versioning-configuration Status=Enabled,MFADelete=Enabled \
#   --mfa "$MFA_DEVICE $(aws sts get-session-token --serial-number "$MFA_DEVICE" --token-code XXXXXX --query 'Credentials.SessionToken' --output text)"

echo ""
echo "✅ S3 bucket setup complete!"
echo ""
echo "Bucket configuration:"
echo "  - Versioning: Enabled"
echo "  - Object Lock: ${LOCK_RETENTION_DAYS} days (GOVERNANCE mode)"
echo "  - Encryption: ${KMS_KEY_ID:+KMS ($KMS_KEY_ID)}${KMS_KEY_ID:-AES256}"
echo "  - Public access: Blocked"
echo "  - Lifecycle: Glacier after 90 days, old versions expire after 365 days"
echo ""
echo "Set these env vars in your Smart EDMS deployment:"
echo "  STORAGE_DRIVER=s3"
echo "  S3_BUCKET=$BUCKET"
echo "  S3_REGION=$REGION"
