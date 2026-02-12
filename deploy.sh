#!/bin/bash
S3_BUCKET="www.copywriting-blog.pl"
CLOUDFRONT_ID="E2VLHCPSA3TV70"

cd /d/copywriting-blog.pl
npm run build
aws s3 sync dist/ s3://${S3_BUCKET} --delete
aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"
echo "✅ Deployed to https://www.copywriting-blog.pl"