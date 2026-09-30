#!/usr/bin/env bash
# 서버 curl 스모크 (PLAN T-P0-14). scripts/contract-test.ts 와 케이스 1:1 — Node 없이 서버 운영자가 돌리는 판.
#
#   bash scripts/server-smoke.sh                 # dev localhost, S-00 ~ S-03
#   bash scripts/server-smoke.sh --only S-00     # 그룹 필터
#   API=https://gnuboard.example.com/api/v1 bash scripts/server-smoke.sh
#   G5_SMOKE_IT_ID=1600398330 bash scripts/server-smoke.sh   # 담을 상품 고정
#
# S-00: 게스트 prepare 초안이 쿠키 없이 ?uid= 만으로 cancel/조회되는가(기존 서버 사실, 2026-09-17 dev 재현).
# S-01: SC-01(배치 A) 회귀 — 배포 전에는 S-01.1/2/3/5 가 FAIL 인 것이 정상.
# S-02/S-03: SC-02 X-Cart-Id·SC-03 게스트 uid 본문/mobile-status(배치 A2, P1-C 착수 게이트) — 배포 전에는 FAIL 이 정상.
set -u

API="${API:-${EXPO_PUBLIC_API_URL:-http://localhost/api/v1}}"
API="${API%/}"
SITE="${API%/api/v1}"
SCHEME="sirsoft-g5"
ONLY=""; YES="${SMOKE_ALLOW_REMOTE_WRITES:-0}"
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2;;
    --yes) YES=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
# 쓰기 케이스(S-00.3~)는 실제 카트·결제 초안을 만든다 — 루프백·사설 LAN 이 아닌 호스트에는 --yes 없이 보내지 않는다.
HOST="${SITE#*://}"; HOST="${HOST%%/*}"; HOST="${HOST%%:*}"
case "$HOST" in
  localhost|127.*|10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*) LOCAL=1;;
  *) LOCAL=0;;
esac
WRITES_BLOCKED=0
if [ "$LOCAL" = 0 ] && [ "$YES" != 1 ]; then WRITES_BLOCKED=1; echo "!! remote host $HOST: write cases skipped (pass --yes to run them)"; fi

JAR="$(mktemp)"
BODY="$(mktemp)"
REQ="$(mktemp)"
HDR="$(mktemp)"
trap 'rm -f "$JAR" "$BODY" "$REQ" "$HDR"' EXIT

PASS=0; FAIL=0; SKIP=0
ORDER_ID=""; UID_=""

want() { case ",$ONLY," in *",$1,"*|",,") return 0;; *) return 1;; esac; }
ok()   { PASS=$((PASS+1)); printf 'PASS %-7s %s\n' "$1" "$2"; }
bad()  { FAIL=$((FAIL+1)); local msg; msg=$(json_get message); printf 'FAIL %-7s %s\n       %s%s\n' "$1" "$2" "$3" "${msg:+ — $msg}"; }
skip() { SKIP=$((SKIP+1)); printf 'SKIP %-7s %s (%s)\n' "$1" "$2" "$3"; }
# json_get <key> — 본문에서 "key":값(문자열이면 따옴표 제거, 숫자/불리언은 그대로)의 첫 항목
json_get() { grep -o "\"$1\":\(\"[^\"]*\"\|[0-9a-z.]*\)" "$BODY" | head -1 | sed -e "s/^\"$1\"://" -e 's/^"//' -e 's/"$//'; }
# req <method> <url> [json body] [c|b|cb] [요청 헤더 한 줄] → 상태 코드 출력, 본문은 $BODY, 응답 헤더는 $HDR 에.
# 요청 본문은 파일로 보낸다 — Windows Git Bash 는 curl.exe 인자를 변환하다 JSON(특히 한글)을 깨뜨려 json_decode 가 실패한다.
req() {
  local method="$1" url="$2" data="${3:-}" cookies="${4:-}" header="${5:-}" args=()
  case "$cookies" in *c*) args+=(-c "$JAR");; esac
  case "$cookies" in *b*) args+=(-b "$JAR");; esac
  if [ -n "$data" ]; then printf '%s' "$data" > "$REQ"; args+=(-H 'Content-Type: application/json' --data-binary "@$REQ"); fi
  if [ -n "$header" ]; then args+=(-H "$header"); fi
  curl -s -D "$HDR" -o "$BODY" -w '%{http_code}' -X "$method" "${args[@]}" "$url"
}
href() { grep -o 'href="[^"]*"' "$BODY" | head -1 | sed -e 's/^href="//' -e 's/"$//' -e 's/&amp;/\&/g' -e 's/&quot;/"/g' -e 's/&lt;/</g' -e 's/&gt;/>/g'; }

if want S-00; then
  code=$(req GET "$API/settings")
  title=$(json_get cf_title)
  if [ "$code" = 200 ] && [ -n "$title" ]; then ok S-00.1 "GET /settings cf_title=$title"; else bad S-00.1 "GET /settings" "status $code cf_title='$title'"; fi

  code=$(req GET "$API/shop/payment/config")
  mode=$(json_get is_test_mode)
  case "$mode" in true|false) ok S-00.2 "payment/config is_test_mode=$mode";; *) bad S-00.2 "payment/config" "status $code is_test_mode='$mode'";; esac

  : > "$JAR"
  added=""
  if [ "$WRITES_BLOCKED" = 1 ]; then
    skip S-00.3 "POST /shop/cart" "remote host, no --yes"
  else
    if [ -n "${G5_SMOKE_IT_ID:-}" ]; then ids="$G5_SMOKE_IT_ID"; else
      req GET "$API/shop/products?per_page=20" >/dev/null
      ids=$(grep -o '"it_id":"[^"]*"' "$BODY" | sed -e 's/"it_id":"//' -e 's/"$//')
    fi
    while IFS= read -r it; do
      [ -n "$it" ] || continue
      code=$(req POST "$API/shop/cart" "{\"it_id\":\"$it\",\"ct_qty\":1}" cb)
      if [ "$code" = 201 ]; then added="$it"; break; fi
    done <<EOF_IDS
$ids
EOF_IDS
    cart_cookie=$(grep -c 'ck_guest_cart_id' "$JAR" || true)
    if [ -n "$added" ] && [ "$cart_cookie" -ge 1 ]; then ok S-00.3 "POST /shop/cart it_id=$added + ck_guest_cart_id"; else bad S-00.3 "POST /shop/cart" "no purchasable product or no cart cookie"; fi
  fi

  if [ -n "$added" ]; then
    code=$(req POST "$API/shop/payment/prepare" '{"od_name":"스모크","od_hp":"010-0000-0000","od_zip":"06236","od_addr1":"서울 강남구 테헤란로 1","od_addr2":"1층","od_email":"smoke@example.com","od_pwd":"smoke123","od_settle_case":"신용카드","payment_device":"mobile"}' cb)
    ORDER_ID=$(json_get order_id); UID_=$(json_get uid)
    if [ "$code" = 201 ] && [ -n "$ORDER_ID" ] && [ ${#UID_} -eq 64 ]; then ok S-00.4 "prepare order_id=$ORDER_ID uid=64hex"; else bad S-00.4 "prepare" "status $code order_id='$ORDER_ID' uid len ${#UID_}"; fi
  else
    skip S-00.4 "prepare" "needs cart"
  fi

  if [ -n "$ORDER_ID" ] && [ -n "$UID_" ]; then
    code=$(req POST "$API/shop/payment/cancel" "{\"order_id\":\"$ORDER_ID\",\"reason\":\"smoke\"}")
    if [ "$code" = 404 ]; then ok S-00.5 "cancel without uid/cookies → 404"; else bad S-00.5 "cancel without uid" "status $code"; fi
    code=$(req GET "$API/shop/orders/$ORDER_ID")
    if [ "$code" = 404 ]; then ok S-00.6 "order without uid/cookies → 404"; else bad S-00.6 "order without uid" "status $code"; fi
    code=$(req POST "$API/shop/payment/cancel?uid=$UID_" "{\"order_id\":\"$ORDER_ID\",\"reason\":\"smoke\"}")
    st=$(json_get status); restored=$(json_get restored)
    if [ "$code" = 200 ] && [ "$st" = "취소" ] && [ "$restored" = 1 ]; then ok S-00.7 "cancel ?uid → 200 status=취소 restored=1"; else bad S-00.7 "cancel ?uid" "status $code status='$st' restored='$restored'"; fi
    code=$(req GET "$API/shop/orders/$ORDER_ID?uid=$UID_")
    ost=$(json_get od_status)
    if [ "$code" = 200 ] && [ "$ost" = "취소" ]; then ok S-00.8 "order ?uid → 200 od_status=취소"; else bad S-00.8 "order ?uid" "status $code od_status='$ost'"; fi
    code=$(req POST "$API/shop/payment/cancel?uid=$UID_" "{\"order_id\":\"$ORDER_ID\",\"reason\":\"smoke\"}")
    restored=$(json_get restored)
    if [ "$code" = 200 ] && [ "$restored" = 0 ]; then ok S-00.9 "cancel again → 200 restored=0"; else bad S-00.9 "cancel again" "status $code restored='$restored'"; fi
  else
    for id in S-00.5 S-00.6 S-00.7 S-00.8 S-00.9; do skip "$id" "uid checks" "needs order_id/uid"; done
  fi
fi

if want S-01; then
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/api/social/start.php?provider=naver&redirect=$SCHEME://social-callback?state=x")
  loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$SITE/api/social/start.php?provider=naver&redirect=$SCHEME://social-callback?state=x")
  case "$code:$loc" in 302:*/api/social/popup.php*) ok S-01.1 "start.php → 302 popup.php";; *) bad S-01.1 "start.php" "status $code location '$loc'";; esac

  q="pg_service=toss&order_id=1&amount=1&paymentKey=k"
  req GET "$API/shop/payment/mobile-return?app_scheme=$SCHEME&$q" >/dev/null; h=$(href)
  exp="$SCHEME://payment/success?provider=toss&orderId=1&amount=1&paymentKey=k"
  if [ "$h" = "$exp" ]; then ok S-01.2 "mobile-return → $h"; else bad S-01.2 "mobile-return app_scheme=$SCHEME" "href '$h' (expected $exp)"; fi

  req GET "$API/shop/payment/mobile-close?app_scheme=$SCHEME&pg_service=toss&order_id=1" >/dev/null; h=$(href)
  exp="$SCHEME://payment/fail?provider=toss&orderId=1&amount=0"
  if [ "$h" = "$exp" ]; then ok S-01.3 "mobile-close → $h"; else bad S-01.3 "mobile-close app_scheme=$SCHEME" "href '$h' (expected $exp)"; fi

  req GET "$API/shop/payment/mobile-return?app_scheme=youngcart&$q" >/dev/null; h=$(href)
  case "$h" in youngcart://payment/success*) ok S-01.4 "youngcart regression kept";; *) bad S-01.4 "youngcart regression" "href '$h'";; esac

  req GET "$API/shop/payment/mobile-return?$q" >/dev/null; h=$(href)
  case "$h" in "$SCHEME://payment/success"*) ok S-01.5 "default scheme → $SCHEME://";; *) bad S-01.5 "default scheme" "href '$h' (expected $SCHEME://payment/success…)";; esac
fi

# S-02 / S-03 (SC-02 X-Cart-Id, SC-03 게스트 uid 본문·mobile-status) — scripts/lib/smoke/cartCases.ts 와 1:1. 쿠키는 보내지 않는다.
CART=""; COD=""; CUID=""
# cart_id_ok — 본문 data.cart_id(16~20자리)와 응답 헤더 X-Cart-Id 가 같으면 참, 그 값은 $GOT_CART 에 둔다.
cart_id_ok() {
  GOT_CART=$(json_get cart_id)
  local hdr
  hdr=$(grep -i '^x-cart-id:' "$HDR" | head -1 | sed -e 's/^[^:]*: *//' -e 's/\r$//')
  case "$GOT_CART" in *[!0-9]*|"") return 1;; esac
  [ ${#GOT_CART} -ge 16 ] && [ ${#GOT_CART} -le 20 ] && [ "$hdr" = "$GOT_CART" ]
}
items_count() { grep -o '"ct_id":' "$BODY" | wc -l | tr -d ' '; }

if want S-02; then
  if [ "$WRITES_BLOCKED" = 1 ]; then
    skip S-02.1 "POST /shop/cart (header)" "remote host, no --yes"
  else
    if [ -n "${G5_SMOKE_IT_ID:-}" ]; then ids="$G5_SMOKE_IT_ID"; else
      req GET "$API/shop/products?per_page=20" >/dev/null
      ids=$(grep -o '"it_id":"[^"]*"' "$BODY" | sed -e 's/"it_id":"//' -e 's/"$//')
    fi
    while IFS= read -r it; do
      [ -n "$it" ] || continue
      code=$(req POST "$API/shop/cart" "{\"it_id\":\"$it\",\"ct_qty\":1}")
      if [ "$code" = 201 ]; then break; fi
    done <<EOF_IDS2
$ids
EOF_IDS2
    if [ "$code" = 201 ] && cart_id_ok; then CART="$GOT_CART"; ok S-02.1 "POST /shop/cart → cart_id=$CART + X-Cart-Id"; else bad S-02.1 "POST /shop/cart (no cookies)" "status $code cart_id='$(json_get cart_id)'"; fi
  fi
  if [ -n "$CART" ]; then
    code=$(req GET "$API/shop/cart" "" "" "X-Cart-Id: $CART")
    if [ "$code" = 200 ] && cart_id_ok && [ "$GOT_CART" = "$CART" ] && [ "$(items_count)" -ge 1 ]; then ok S-02.2 "GET /shop/cart header only → same cart, items kept"; else bad S-02.2 "GET /shop/cart header only" "status $code cart_id='$GOT_CART' items=$(items_count)"; fi
    code=$(req GET "$API/shop/cart")
    if [ "$code" = 200 ] && cart_id_ok && [ "$GOT_CART" != "$CART" ] && [ "$(items_count)" = 0 ]; then ok S-02.3 "GET /shop/cart bare → new empty cart"; else bad S-02.3 "GET /shop/cart bare" "status $code cart_id='$GOT_CART' items=$(items_count)"; fi
    code=$(req POST "$API/shop/payment/prepare" '{"od_name":"스모크","od_hp":"010-0000-0000","od_zip":"06236","od_addr1":"서울 강남구 테헤란로 1","od_addr2":"1층","od_email":"smoke@example.com","od_pwd":"smoke123","od_settle_case":"신용카드","payment_device":"mobile"}' "" "X-Cart-Id: $CART")
    COD=$(json_get order_id); CUID=$(json_get uid)
    if [ "$code" = 201 ] && cart_id_ok && [ "$GOT_CART" = "$CART" ] && [ ${#CUID} -eq 64 ]; then ok S-02.4 "prepare header cart → order_id=$COD"; else bad S-02.4 "prepare header cart" "status $code cart_id='$GOT_CART' uid len ${#CUID}"; COD=""; fi
  else
    for id in S-02.2 S-02.3 S-02.4; do skip "$id" "header cart" "needs cart_id"; done
  fi
fi

if want S-03; then
  if [ -n "$COD" ] && [ -n "$CUID" ]; then
    code=$(req GET "$API/shop/payment/mobile-status?order_id=$COD&uid=$CUID")
    if [ "$code" = 200 ] && [ "$(json_get pending)" = true ] && [ "$(json_get confirmable)" = true ]; then ok S-03.1 "mobile-status guest uid → 200 pending"; else bad S-03.1 "mobile-status guest uid" "status $code pending='$(json_get pending)'"; fi
    code=$(req GET "$API/shop/payment/mobile-status?order_id=$COD")
    if [ "$code" = 404 ]; then ok S-03.2 "mobile-status without uid → 404"; else bad S-03.2 "mobile-status without uid" "status $code"; fi
    code=$(req POST "$API/shop/payment/cancel" "{\"order_id\":\"$COD\",\"uid\":\"0000000000000000000000000000000000000000000000000000000000000000\",\"reason\":\"smoke\"}")
    if [ "$code" = 404 ]; then ok S-03.3 "cancel wrong body uid → 404"; else bad S-03.3 "cancel wrong body uid" "status $code"; fi
    code=$(req POST "$API/shop/payment/cancel" "{\"order_id\":\"$COD\",\"uid\":\"$CUID\",\"reason\":\"smoke\"}" "" "X-Cart-Id: $CART")
    if [ "$code" = 200 ] && [ "$(json_get status)" = "취소" ] && [ "$(json_get restored)" = 1 ] && cart_id_ok && [ "$GOT_CART" = "$CART" ]; then ok S-03.4 "cancel body uid → 200, restored into $CART"; else bad S-03.4 "cancel body uid" "status $code restored='$(json_get restored)' cart_id='$GOT_CART'"; fi
    code=$(req GET "$API/shop/payment/mobile-status?order_id=$COD&uid=$CUID")
    if [ "$code" = 200 ] && [ "$(json_get cancelled)" = true ]; then ok S-03.5 "mobile-status after cancel → cancelled"; else bad S-03.5 "mobile-status after cancel" "status $code cancelled='$(json_get cancelled)'"; fi
  else
    for id in S-03.1 S-03.2 S-03.3 S-03.4 S-03.5; do skip "$id" "guest payment" "needs S-02 draft"; done
  fi
fi

echo "$PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
