
#!/bin/bash

#
# Batch delete old Cloudflare Pages deployments
#
# - Fetches ALL deployments using Cloudflare REST API pagination
# - Keeps the newest KEEP_COUNT deployments
# - Deletes the oldest BATCH_SIZE deployments per run
# - Requires confirmation before deleting
#
# Requirements:
# - curl
# - Node.js 18+
#
# Required environment variables:
#   CLOUDFLARE_ACCOUNT_ID
#   CLOUDFLARE_API_TOKEN
#
# API Token permissions:
#   Cloudflare Pages: Edit
#

set -euo pipefail

# PROJECT_NAME="issuedesk"
PROJECT_NAME="nexora"

# Keep the newest 50 deployments
KEEP_COUNT=40

# Delete at most 10 old deployments per run
BATCH_SIZE=10

# Cloudflare API supports pagination.
# 100 is used to reduce the number of API requests.
PER_PAGE=25

# ------------------------------------------------------------
# Validate configuration
# ------------------------------------------------------------

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "ERROR: CLOUDFLARE_ACCOUNT_ID is not set."
  echo ""
  echo "Example:"
  echo "  export CLOUDFLARE_ACCOUNT_ID=\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\""
  exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set."
  echo ""
  echo "Example:"
  echo "  export CLOUDFLARE_API_TOKEN=\"your-api-token\""
  exit 1
fi

API_BASE="https://api.cloudflare.com/client/v4"

DEPLOYMENTS_FILE=$(mktemp)
trap 'rm -f "$DEPLOYMENTS_FILE"' EXIT

echo "============================================"
echo " Cloudflare Pages Deployment Cleanup"
echo "============================================"
echo " Project       : $PROJECT_NAME"
echo " Keep newest   : $KEEP_COUNT"
echo " Delete up to  : $BATCH_SIZE"
echo "============================================"
echo ""

# ------------------------------------------------------------
# Fetch all deployments
# ------------------------------------------------------------

echo "Fetching deployments from Cloudflare API..."
echo ""

PAGE=1
TOTAL_FETCHED=0

echo "[]" > "$DEPLOYMENTS_FILE"

while true; do
  echo -n "Fetching page $PAGE ... "

  RESPONSE=$(curl -sS \
    --request GET \
    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    --header "Content-Type: application/json" \
    "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments?page=$PAGE&per_page=$PER_PAGE")

  API_SUCCESS=$(node -e "
    const data = JSON.parse(process.argv[1]);
    process.stdout.write(data.success === true ? 'true' : 'false');
  " "$RESPONSE")

  if [ "$API_SUCCESS" != "true" ]; then
    echo "FAILED"

    node -e "
      const data = JSON.parse(process.argv[1]);

      for (const error of data.errors || []) {
        console.error(
          '[' + (error.code ?? 'unknown') + '] ' +
          (error.message ?? 'Unknown error')
        );
      }
    " "$RESPONSE"

    exit 1
  fi

  PAGE_COUNT=$(node -e "
    const data = JSON.parse(process.argv[1]);
    process.stdout.write(
      String(Array.isArray(data.result) ? data.result.length : 0)
    );
  " "$RESPONSE")

  TOTAL_PAGES=$(node -e "
    const data = JSON.parse(process.argv[1]);

    process.stdout.write(
      String(data.result_info?.total_pages ?? 1)
    );
  " "$RESPONSE")

  TOTAL_COUNT=$(node -e "
    const data = JSON.parse(process.argv[1]);

    process.stdout.write(
      String(data.result_info?.total_count ?? 0)
    );
  " "$RESPONSE")

  echo "$PAGE_COUNT deployment(s) [$PAGE/$TOTAL_PAGES]"

  node - "$DEPLOYMENTS_FILE" "$RESPONSE" <<'NODE'
const fs = require("fs");

const file = process.argv[2];
const response = JSON.parse(process.argv[3]);

const existing = JSON.parse(
  fs.readFileSync(file, "utf8")
);

const incoming = Array.isArray(response.result)
  ? response.result
  : [];

fs.writeFileSync(
  file,
  JSON.stringify([...existing, ...incoming])
);
NODE

  TOTAL_FETCHED=$((TOTAL_FETCHED + PAGE_COUNT))

  if [ "$PAGE" -ge "$TOTAL_PAGES" ]; then
    break
  fi

  PAGE=$((PAGE + 1))
done

echo ""
echo "Total deployments reported: $TOTAL_COUNT"
echo "Total deployments fetched : $TOTAL_FETCHED"
echo ""

# ------------------------------------------------------------
# Check whether cleanup is needed
# ------------------------------------------------------------

if [ "$TOTAL_FETCHED" -le "$KEEP_COUNT" ]; then
  echo "Nothing to delete."
  echo ""
  echo "Total deployments : $TOTAL_FETCHED"
  echo "Keep newest       : $KEEP_COUNT"
  exit 0
fi

# ------------------------------------------------------------
# Select oldest deployments
# ------------------------------------------------------------

DELETE_JSON=$(node - "$DEPLOYMENTS_FILE" "$KEEP_COUNT" "$BATCH_SIZE" <<'NODE'
const fs = require("fs");

const file = process.argv[2];
const keepCount = Number(process.argv[3]);
const batchSize = Number(process.argv[4]);

const deployments = JSON.parse(
  fs.readFileSync(file, "utf8")
);

/*
 * Newest -> oldest
 */
deployments.sort(
  (a, b) =>
    new Date(b.created_on).getTime() -
    new Date(a.created_on).getTime()
);

/*
 * Protect newest KEEP_COUNT deployments.
 */
const oldDeployments = deployments.slice(keepCount);

/*
 * Delete the absolute oldest deployments first.
 */
const toDelete = oldDeployments
  .slice(-batchSize)
  .reverse();

/*
 * Output only information needed by bash.
 */
console.log(JSON.stringify(
  toDelete.map(deployment => ({
    id: deployment.id,
    created_on: deployment.created_on,
    environment: deployment.environment || "unknown",
    url: deployment.url || ""
  }))
));
NODE
)

DELETE_COUNT=$(node -e "
  const data = JSON.parse(process.argv[1]);
  process.stdout.write(String(data.length));
" "$DELETE_JSON")

if [ "$DELETE_COUNT" -eq 0 ]; then
  echo "No deployments selected for deletion."
  exit 0
fi

# ------------------------------------------------------------
# Show deletion plan
# ------------------------------------------------------------

echo "Deployments selected for deletion:"
echo ""

node -e "
const data = JSON.parse(process.argv[1]);

data.forEach((deployment, index) => {
  console.log(
    String(index + 1).padStart(2, ' ') + '. ' +
    deployment.id
  );

  console.log(
    '    Created: ' + deployment.created_on
  );

  console.log(
    '    Environment: ' + deployment.environment
  );

  if (deployment.url) {
    console.log(
      '    URL: ' + deployment.url
    );
  }

  console.log('');
});
" "$DELETE_JSON"

echo "--------------------------------------------"
echo "Total deployments : $TOTAL_FETCHED"
echo "Newest protected   : $KEEP_COUNT"
echo "Deleting this run : $DELETE_COUNT"
echo "--------------------------------------------"
echo ""

# ------------------------------------------------------------
# Confirmation
# ------------------------------------------------------------

read -r -p "Type 'yes' to delete these deployments: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo ""
  echo "Aborted."
  exit 0
fi

echo ""
echo "Deleting deployments..."
echo ""

# ------------------------------------------------------------
# Delete
# ------------------------------------------------------------

SUCCESS=0
FAILED=0

DELETE_IDS=$(node -e "
const data = JSON.parse(process.argv[1]);

for (const deployment of data) {
  console.log(deployment.id);
}
" "$DELETE_JSON")

while IFS= read -r DEPLOY_ID; do
  [ -z "$DEPLOY_ID" ] && continue

  echo -n "Deleting $DEPLOY_ID ... "

  RESPONSE=$(curl -sS \
    --request DELETE \
    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    --header "Content-Type: application/json" \
    "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments/$DEPLOY_ID")

  API_SUCCESS=$(node -e "
    const data = JSON.parse(process.argv[1]);
    process.stdout.write(data.success === true ? 'true' : 'false');
  " "$RESPONSE")

  if [ "$API_SUCCESS" = "true" ]; then
    echo "OK"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "FAILED"
    FAILED=$((FAILED + 1))

    node -e "
      const data = JSON.parse(process.argv[1]);

      if (Array.isArray(data.errors)) {
        for (const error of data.errors) {
          console.error(
            '    [' + (error.code ?? 'unknown') + '] ' +
            (error.message ?? 'Unknown error')
          );
        }
      }
    " "$RESPONSE"
  fi

done <<< "$DELETE_IDS"

echo ""
echo "============================================"
echo " Cleanup complete"
echo "--------------------------------------------"
echo " Success : $SUCCESS"
echo " Failed  : $FAILED"
echo "============================================"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
