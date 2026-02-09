#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
PHONE="${PHONE:-13800000123}"
DEVICE_ID="${DEVICE_ID:-smoke-device-1}"
PASSWORD="${PASSWORD:-abc12345}"

log() {
  printf '[SMOKE] %s\n' "$1"
}

json_get() {
  local json="$1"
  local path="$2"
  node -e '
const obj = JSON.parse(process.argv[1]);
const path = process.argv[2].split(".");
let cur = obj;
for (const p of path) {
  if (cur == null) {
    process.exit(2);
  }
  cur = cur[p];
}
if (cur == null) {
  process.exit(2);
}
if (typeof cur === "object") {
  process.stdout.write(JSON.stringify(cur));
} else {
  process.stdout.write(String(cur));
}
' "$json" "$path"
}

assert_ok() {
  local json="$1"
  local step="$2"
  local code
  code="$(json_get "$json" "code" || true)"
  if [[ "$code" != "0" ]]; then
    printf '[SMOKE][FAIL] %s: %s\n' "$step" "$json" >&2
    exit 1
  fi
}

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"

  local tmp
  tmp="$(mktemp)"

  local http_code
  if [[ -n "$token" ]]; then
    http_code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -H "x-device-id: $DEVICE_ID" \
      -H "Authorization: Bearer $token" \
      ${body:+-d "$body"})"
  else
    http_code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -H "x-device-id: $DEVICE_ID" \
      ${body:+-d "$body"})"
  fi

  local resp
  resp="$(cat "$tmp")"
  rm -f "$tmp"

  if [[ "$http_code" -ge 400 ]]; then
    printf '[SMOKE][FAIL] HTTP %s %s -> %s\n%s\n' "$method" "$path" "$http_code" "$resp" >&2
    exit 1
  fi

  printf '%s' "$resp"
}

log "1/11 发送短信验证码"
SEND="$(request POST /v1/auth/sms/send "{\"phone\":\"$PHONE\"}")"
assert_ok "$SEND" "sms_send"
CODE="$(json_get "$SEND" "data.debugCode" || true)"
if [[ -z "$CODE" ]]; then
  echo "[SMOKE][FAIL] 未拿到 debugCode。请确保服务运行在非 production 环境。" >&2
  exit 1
fi

log "2/11 短信验证码登录"
VERIFY="$(request POST /v1/auth/sms/verify "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}")"
assert_ok "$VERIFY" "sms_verify"
TOKEN="$(json_get "$VERIFY" "data.session_token")"

log "3/11 设置密码"
SET_PWD="$(request POST /v1/auth/password/set "{\"password\":\"$PASSWORD\"}" "$TOKEN")"
assert_ok "$SET_PWD" "password_set"

log "4/11 密码登录"
PWD_LOGIN="$(request POST /v1/auth/password/login "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\"}")"
assert_ok "$PWD_LOGIN" "password_login"
TOKEN2="$(json_get "$PWD_LOGIN" "data.session_token")"

TEXT='今天我一直在想工作压力，我很焦虑，肩膀很紧绷。'

log "5/11 创建日记"
CREATE="$(request POST /v1/journals "{\"mode\":\"guided\",\"source\":\"text\",\"raw_text\":\"$TEXT\"}" "$TOKEN2")"
assert_ok "$CREATE" "journal_create"
ENTRY_ID="$(json_get "$CREATE" "data.id")"

log "6/11 AI 三色分析"
ANALYZE="$(request POST "/v1/journals/$ENTRY_ID/analyze" "{}" "$TOKEN2")"
assert_ok "$ANALYZE" "journal_analyze"
SPANS="$(json_get "$ANALYZE" "data.spans")"

log "7/11 用户确认/修正 spans"
PATCH_BODY="$(node -e 'const spans=JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify({spans:spans.map(s=>({start:s.start,end:s.end,label:s.label}))}));' "$SPANS")"
PATCH="$(request PATCH "/v1/journals/$ENTRY_ID/spans" "$PATCH_BODY" "$TOKEN2")"
assert_ok "$PATCH" "journal_patch_spans"

log "8/11 反思卡查询"
REFLECT="$(request GET "/v1/journals/$ENTRY_ID/reflection" "" "$TOKEN2")"
assert_ok "$REFLECT" "journal_reflection"

MONTH="$(node -e 'const d=new Date();const m=String(d.getMonth()+1).padStart(2,"0");process.stdout.write(`${d.getFullYear()}-${m}`);')"
WEEK_START="$(node -e 'const d=new Date();const utc=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=utc.getUTCDay();const offset=day===0?-6:1-day;utc.setUTCDate(utc.getUTCDate()+offset);process.stdout.write(utc.toISOString().slice(0,10));')"

log "9/11 花园日历"
GARDEN="$(request GET "/v1/calendar/garden?month=$MONTH" "" "$TOKEN2")"
assert_ok "$GARDEN" "calendar_garden"

log "10/11 周回顾"
WEEKLY="$(request GET "/v1/reports/weekly?week_start=$WEEK_START" "" "$TOKEN2")"
assert_ok "$WEEKLY" "report_weekly"

log "11/11 提醒与计费"
REM_GET="$(request GET "/v1/reminders/settings" "" "$TOKEN2")"
assert_ok "$REM_GET" "reminder_get"
REM_PATCH="$(request PATCH "/v1/reminders/settings" '{"enabled":false,"time":"22:30"}' "$TOKEN2")"
assert_ok "$REM_PATCH" "reminder_patch"
ENT_1="$(request GET "/v1/billing/entitlement" "" "$TOKEN2")"
assert_ok "$ENT_1" "billing_entitlement_before"
BILLING="$(request POST "/v1/billing/receipt/verify" '{"receipt_data":"receipt_test_123456"}' "$TOKEN2")"
assert_ok "$BILLING" "billing_verify"
ENT_2="$(request GET "/v1/billing/entitlement" "" "$TOKEN2")"
assert_ok "$ENT_2" "billing_entitlement_after"

PREMIUM_ACTIVE="$(json_get "$ENT_2" "data.premiumActive")"
if [[ "$PREMIUM_ACTIVE" != "true" ]]; then
  echo "[SMOKE][FAIL] 订阅校验后 premiumActive 不是 true" >&2
  exit 1
fi

log "PASS: 全链路冒烟通过"
