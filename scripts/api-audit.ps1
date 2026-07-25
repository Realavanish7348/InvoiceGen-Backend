<#
.SYNOPSIS
  InvoiceGen production-style API audit via curl.exe + JSONL log.

.DESCRIPTION
  Writes request JSON to a no-space temp dir (avoids PowerShell quote mangling),
  hits live BASE, logs each case to results.jsonl.
  Pair with MongoDB MCP verification when run via /.cursor/commands/api-audit.md.

.EXAMPLE
  cd backend
  .\scripts\api-audit.ps1
  .\scripts\api-audit.ps1 -Scope auth
  .\scripts\api-audit.ps1 -BaseUrl http://127.0.0.1:5000
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = "",
  [ValidateSet("all", "system", "auth", "users", "profile", "catalog", "invoices", "dashboard", "notifications", "subscriptions")]
  [string]$Scope = "all",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Continue"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $PSScriptRoot "..\package.json"))) {
  $Root = Split-Path $PSScriptRoot -Parent
}
$Backend = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $BaseUrl) {
  $envPath = Join-Path $Backend ".env"
  $port = "5000"
  if (Test-Path $envPath) {
    $m = Select-String -Path $envPath -Pattern '^PORT=(.+)$' | Select-Object -First 1
    if ($m) { $port = $m.Matches.Groups[1].Value.Trim() }
  }
  $BaseUrl = "http://127.0.0.1:$port"
}

if (-not $OutDir) {
  $OutDir = Join-Path $env:TEMP "invoicegen-audit"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$EMAIL_A = "audit-$ts-a@example.com"
$EMAIL_B = "audit-$ts-b@example.com"
$EMAIL_LOCK = "audit-$ts-lock@example.com"
$PASS = "Password1!"
$JAR_A = Join-Path $OutDir "jar-a.txt"
$JAR_B = Join-Path $OutDir "jar-b.txt"
$LOG = Join-Path $OutDir "results.jsonl"
if (Test-Path $LOG) { Remove-Item $LOG -Force }

function Write-Json([string]$Path, $Obj) {
  [System.IO.File]::WriteAllText($Path, ($Obj | ConvertTo-Json -Compress -Depth 40))
}

function Invoke-Case {
  param(
    [string]$Id,
    [string]$Method,
    [string]$Url,
    [string]$JsonFile = $null,
    [string]$Token = $null,
    [string]$CookieJar = $null,
    [string]$CookieRead = $null,
    [switch]$NoBody,
    [string[]]$Extra = @()
  )
  $bodyFile = Join-Path $OutDir "$Id-body.bin"
  $hdrFile = Join-Path $OutDir "$Id-hdr.txt"
  $args = @("-sS", "-D", $hdrFile, "-o", $bodyFile, "-w", "%{http_code}", "-X", $Method, $Url)
  if ($Token) { $args += @("-H", "Authorization: Bearer $Token") }
  if ($CookieJar) { $args += @("-c", $CookieJar) }
  if ($CookieRead) { $args += @("-b", $CookieRead) }
  if ($JsonFile) {
    $args += @("-H", "Content-Type: application/json", "--data-binary", "@$JsonFile")
  }
  elseif (-not $NoBody -and $Method -match '^(POST|PATCH|PUT)$') {
    $empty = Join-Path $OutDir "_empty.json"
    [System.IO.File]::WriteAllText($empty, "{}")
    $args += @("-H", "Content-Type: application/json", "--data-binary", "@$empty")
  }
  if ($Extra.Count) { $args += $Extra }

  $codeStr = & curl.exe @args
  $code = 0
  [void][int]::TryParse("$codeStr", [ref]$code)
  $bodyText = if (Test-Path $bodyFile) { [System.IO.File]::ReadAllText($bodyFile) } else { "" }
  $preview = if ($bodyText.Length -gt 500) { $bodyText.Substring(0, 500) } else { $bodyText }
  $row = (@{ id = $Id; method = $Method; url = $Url; http = $code; body = $preview.Trim() } | ConvertTo-Json -Compress)
  [System.IO.File]::AppendAllText($LOG, $row + "`n")
  Write-Host ("{0} => HTTP {1}" -f $Id, $code)
  return @{ code = $code; body = $bodyText }
}

function Test-Want([string]$Name) {
  return ($Scope -eq "all" -or $Scope -eq $Name)
}

Write-Host "BASE=$BaseUrl SCOPE=$Scope OUT=$OutDir"
Write-Json (Join-Path $OutDir "meta.json") @{
  base = $BaseUrl; scope = $Scope; ts = $ts
  emailA = $EMAIL_A; emailB = $EMAIL_B; emailLock = $EMAIL_LOCK
}

# ----- System -----
if (Test-Want "system") {
  Invoke-Case SYS-root GET "$BaseUrl/" -NoBody | Out-Null
  Invoke-Case SYS-health GET "$BaseUrl/health" -NoBody | Out-Null
  Invoke-Case SYS-ready GET "$BaseUrl/ready" -NoBody | Out-Null
  Invoke-Case SYS-uploads-missing GET "$BaseUrl/uploads/does-not-exist.png" -NoBody | Out-Null
}

# ----- Auth (also when scoped modules need tokens) -----
$needAuth = $Scope -in @("all", "auth", "users", "profile", "catalog", "invoices", "dashboard", "notifications", "subscriptions")
$TOKEN_A = $null; $TOKEN_B = $null; $USER_A = $null; $CO_A = $null

if ($needAuth) {
  Write-Json (Join-Path $OutDir "req-reg-a.json") @{ email = $EMAIL_A; password = $PASS; name = "Audit Alice" }
  $rA = Invoke-Case AUTH-register-A POST "$BaseUrl/api/v1/auth/register" -JsonFile (Join-Path $OutDir "req-reg-a.json") -CookieJar $JAR_A
  $jA = $rA.body | ConvertFrom-Json
  $TOKEN_A = $jA.data.accessToken
  $USER_A = $jA.data.user.id
  $CO_A = $jA.data.user.activeCompanyId

  if (Test-Want "auth") {
    Write-Json (Join-Path $OutDir "req-empty.json") @{}
    Invoke-Case AUTH-register-missing POST "$BaseUrl/api/v1/auth/register" -JsonFile (Join-Path $OutDir "req-empty.json") | Out-Null
    Write-Json (Join-Path $OutDir "req-bad-email.json") @{ email = "not-an-email"; password = $PASS; name = "X" }
    Invoke-Case AUTH-register-bad-email POST "$BaseUrl/api/v1/auth/register" -JsonFile (Join-Path $OutDir "req-bad-email.json") | Out-Null
    Write-Json (Join-Path $OutDir "req-weak.json") @{ email = "weak-$ts@example.com"; password = "short"; name = "X" }
    Invoke-Case AUTH-register-weak-pass POST "$BaseUrl/api/v1/auth/register" -JsonFile (Join-Path $OutDir "req-weak.json") | Out-Null
    Write-Json (Join-Path $OutDir "req-dup.json") @{ email = $EMAIL_A; password = $PASS; name = "Dup" }
    Invoke-Case AUTH-register-dup POST "$BaseUrl/api/v1/auth/register" -JsonFile (Join-Path $OutDir "req-dup.json") | Out-Null
  }

  Write-Json (Join-Path $OutDir "req-reg-b.json") @{ email = $EMAIL_B; password = $PASS; name = "Audit Bob" }
  $rB = Invoke-Case AUTH-register-B POST "$BaseUrl/api/v1/auth/register" -JsonFile (Join-Path $OutDir "req-reg-b.json") -CookieJar $JAR_B
  $jB = $rB.body | ConvertFrom-Json
  $TOKEN_B = $jB.data.accessToken

  if (Test-Want "auth") {
    Write-Json (Join-Path $OutDir "req-login.json") @{ email = $EMAIL_A; password = $PASS }
    Invoke-Case AUTH-login-ok POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-login.json") -CookieJar (Join-Path $OutDir "jar-login.txt") | Out-Null
    Write-Json (Join-Path $OutDir "req-login-bad.json") @{ email = $EMAIL_A; password = "WrongPass1!" }
    Invoke-Case AUTH-login-bad-pass POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-login-bad.json") | Out-Null
    Write-Json (Join-Path $OutDir "req-login-unk.json") @{ email = "nosuch-$ts@example.com"; password = $PASS }
    Invoke-Case AUTH-login-unknown POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-login-unk.json") | Out-Null
    Invoke-Case AUTH-login-empty POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-empty.json") | Out-Null

    Copy-Item $JAR_A (Join-Path $OutDir "jar-a-pre-refresh.txt") -Force
    Invoke-Case AUTH-refresh-ok POST "$BaseUrl/api/v1/auth/refresh" -CookieRead $JAR_A -CookieJar $JAR_A -NoBody | Out-Null
    Invoke-Case AUTH-refresh-reuse POST "$BaseUrl/api/v1/auth/refresh" -CookieRead (Join-Path $OutDir "jar-a-pre-refresh.txt") -NoBody | Out-Null
    Invoke-Case AUTH-refresh-nocookie POST "$BaseUrl/api/v1/auth/refresh" -NoBody | Out-Null

    Write-Json (Join-Path $OutDir "req-login.json") @{ email = $EMAIL_A; password = $PASS }
    $rLogin = Invoke-Case AUTH-relogin-A POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-login.json") -CookieJar $JAR_A
    $TOKEN_A = ($rLogin.body | ConvertFrom-Json).data.accessToken

    Invoke-Case AUTH-logout POST "$BaseUrl/api/v1/auth/logout" -CookieRead $JAR_A -CookieJar $JAR_A -NoBody | Out-Null
    Invoke-Case AUTH-logout-nocookie POST "$BaseUrl/api/v1/auth/logout" -NoBody | Out-Null

    $rLogin = Invoke-Case AUTH-relogin-A2 POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-login.json") -CookieJar $JAR_A
    $TOKEN_A = ($rLogin.body | ConvertFrom-Json).data.accessToken
    Invoke-Case AUTH-logout-all POST "$BaseUrl/api/v1/auth/logout-all" -Token $TOKEN_A -NoBody | Out-Null
    Invoke-Case AUTH-refresh-after-logout-all POST "$BaseUrl/api/v1/auth/refresh" -CookieRead $JAR_A -NoBody | Out-Null

    Start-Sleep -Seconds 2
    $rLogin = Invoke-Case AUTH-relogin-A3 POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-login.json") -CookieJar $JAR_A
    $TOKEN_A = ($rLogin.body | ConvertFrom-Json).data.accessToken

    Write-Json (Join-Path $OutDir "req-forgot.json") @{ email = $EMAIL_A }
    Invoke-Case AUTH-forgot-existing POST "$BaseUrl/api/v1/auth/forgot-password" -JsonFile (Join-Path $OutDir "req-forgot.json") | Out-Null
    Write-Json (Join-Path $OutDir "req-forgot-unk.json") @{ email = "nobody-$ts@example.com" }
    Invoke-Case AUTH-forgot-unknown POST "$BaseUrl/api/v1/auth/forgot-password" -JsonFile (Join-Path $OutDir "req-forgot-unk.json") | Out-Null
    Write-Json (Join-Path $OutDir "req-forgot-bad.json") @{ email = "bad" }
    Invoke-Case AUTH-forgot-bad-email POST "$BaseUrl/api/v1/auth/forgot-password" -JsonFile (Join-Path $OutDir "req-forgot-bad.json") | Out-Null
    Write-Json (Join-Path $OutDir "req-reset-bad.json") @{ token = "invalid"; password = "Password2!" }
    Invoke-Case AUTH-reset-bad-token POST "$BaseUrl/api/v1/auth/reset-password" -JsonFile (Join-Path $OutDir "req-reset-bad.json") | Out-Null
    Write-Json (Join-Path $OutDir "req-verify-bad.json") @{ token = "invalid" }
    Invoke-Case AUTH-verify-bad-token POST "$BaseUrl/api/v1/auth/verify-email" -JsonFile (Join-Path $OutDir "req-verify-bad.json") | Out-Null
    Invoke-Case AUTH-resend-verify POST "$BaseUrl/api/v1/auth/resend-verification" -Token $TOKEN_A -NoBody | Out-Null

    Write-Json (Join-Path $OutDir "req-lock-reg.json") @{ email = $EMAIL_LOCK; password = $PASS; name = "Lock Target" }
    Invoke-Case AUTH-lock-register POST "$BaseUrl/api/v1/auth/register" -JsonFile (Join-Path $OutDir "req-lock-reg.json") | Out-Null
    Start-Sleep -Seconds 2
    Write-Json (Join-Path $OutDir "req-lock-bad.json") @{ email = $EMAIL_LOCK; password = "WrongPass1!" }
    1..6 | ForEach-Object {
      Invoke-Case "AUTH-lock-fail-$_" POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-lock-bad.json") | Out-Null
      Start-Sleep -Seconds 1
    }
    Write-Json (Join-Path $OutDir "req-lock-ok.json") @{ email = $EMAIL_LOCK; password = $PASS }
    Invoke-Case AUTH-lock-correct-while-locked POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-lock-ok.json") | Out-Null
  }

  if (-not $TOKEN_A) {
    Write-Json (Join-Path $OutDir "req-login.json") @{ email = $EMAIL_A; password = $PASS }
    $rLogin = Invoke-Case AUTH-ensure-A POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-login.json") -CookieJar $JAR_A
    $TOKEN_A = ($rLogin.body | ConvertFrom-Json).data.accessToken
  }
  if (-not $TOKEN_B) {
    Write-Json (Join-Path $OutDir "req-login-b.json") @{ email = $EMAIL_B; password = $PASS }
    $rLoginB = Invoke-Case AUTH-ensure-B POST "$BaseUrl/api/v1/auth/login" -JsonFile (Join-Path $OutDir "req-login-b.json") -CookieJar $JAR_B
    $TOKEN_B = ($rLoginB.body | ConvertFrom-Json).data.accessToken
  }
}

# ----- Users -----
if (Test-Want "users") {
  Invoke-Case USR-me-ok GET "$BaseUrl/api/v1/users/me" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case USR-me-noauth GET "$BaseUrl/api/v1/users/me" -NoBody | Out-Null
  Invoke-Case USR-me-badtoken GET "$BaseUrl/api/v1/users/me" -Token "not.a.jwt" -NoBody | Out-Null
  Write-Json (Join-Path $OutDir "req-patch-me.json") @{ name = "Alice Updated"; phone = "+15551234567" }
  Invoke-Case USR-patch-me-ok PATCH "$BaseUrl/api/v1/users/me" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-patch-me.json") | Out-Null
  Write-Json (Join-Path $OutDir "req-del-bad.json") @{ confirmation = "DELETE" }
  Invoke-Case USR-delete-bad-confirm DELETE "$BaseUrl/api/v1/users/me" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-del-bad.json") | Out-Null
  Invoke-Case USR-export GET "$BaseUrl/api/v1/users/me/export" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case USR-sessions GET "$BaseUrl/api/v1/users/me/sessions" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case USR-session-revoke-missing DELETE "$BaseUrl/api/v1/users/me/sessions/000000000000000000000000" -Token $TOKEN_A -NoBody | Out-Null
}

# ----- Business profile -----
if (Test-Want "profile") {
  Invoke-Case BP-get GET "$BaseUrl/api/v1/business-profile" -Token $TOKEN_A -NoBody | Out-Null
  Write-Json (Join-Path $OutDir "req-bp.json") @{ name = "Alice Co"; email = "biz-$ts@example.com" }
  Invoke-Case BP-patch PATCH "$BaseUrl/api/v1/business-profile" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-bp.json") | Out-Null
  Invoke-Case BP-logo-missing POST "$BaseUrl/api/v1/business-profile/logo" -Token $TOKEN_A -NoBody -Extra @("-F", "notlogo=x") | Out-Null
  $png = Join-Path $OutDir "logo.png"
  [System.IO.File]::WriteAllBytes($png, [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))
  Invoke-Case BP-logo-ok POST "$BaseUrl/api/v1/business-profile/logo" -Token $TOKEN_A -NoBody -Extra @("-F", "logo=@$png;type=image/png") | Out-Null
}

# ----- Catalog -----
$TAX_ID = $null; $CLIENT_ID = $null; $PRODUCT_ID = $null; $SERVICE_ID = $null; $TEMPLATE_ID = $null
if (Test-Want "catalog" -or Test-Want "invoices") {
  Write-Json (Join-Path $OutDir "req-tax.json") @{ name = "GST"; rateBps = 1800; isDefault = $true }
  $tax = Invoke-Case TAX-create POST "$BaseUrl/api/v1/tax-rules" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-tax.json")
  $TAX_ID = ($tax.body | ConvertFrom-Json).data._id

  Write-Json (Join-Path $OutDir "req-cli.json") @{ name = "Acme Client"; email = "client-$ts@example.com" }
  $cli = Invoke-Case CLI-create POST "$BaseUrl/api/v1/clients" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-cli.json")
  $CLIENT_ID = ($cli.body | ConvertFrom-Json).data._id
  Invoke-Case CLI-get-idor GET "$BaseUrl/api/v1/clients/$CLIENT_ID" -Token $TOKEN_B -NoBody | Out-Null

  Write-Json (Join-Path $OutDir "req-prd.json") @{ name = "Widget"; unitPrice = 1999; taxRuleId = $TAX_ID }
  $prd = Invoke-Case PRD-create POST "$BaseUrl/api/v1/products" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-prd.json")
  $PRODUCT_ID = ($prd.body | ConvertFrom-Json).data._id

  Write-Json (Join-Path $OutDir "req-svc.json") @{ name = "Consulting"; unitPrice = 15000; taxRuleId = $TAX_ID }
  $svc = Invoke-Case SVC-create POST "$BaseUrl/api/v1/services" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-svc.json")
  $SERVICE_ID = ($svc.body | ConvertFrom-Json).data._id

  Write-Json (Join-Path $OutDir "req-tpl.json") @{ name = "Classic"; layout = "classic"; isDefault = $true }
  $tpl = Invoke-Case TPL-create POST "$BaseUrl/api/v1/templates" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-tpl.json")
  $TEMPLATE_ID = ($tpl.body | ConvertFrom-Json).data._id
  Invoke-Case TPL-get-idor GET "$BaseUrl/api/v1/templates/$TEMPLATE_ID" -Token $TOKEN_B -NoBody | Out-Null

  if (Test-Want "catalog") {
    Invoke-Case TAX-get-idor GET "$BaseUrl/api/v1/tax-rules/$TAX_ID" -Token $TOKEN_B -NoBody | Out-Null
    Write-Json (Join-Path $OutDir "req-prd-badtax.json") @{ name = "X"; unitPrice = 1; taxRuleId = "000000000000000000000000" }
    Invoke-Case PRD-create-badtax POST "$BaseUrl/api/v1/products" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-prd-badtax.json") | Out-Null
    Invoke-Case SET-get GET "$BaseUrl/api/v1/settings" -Token $TOKEN_A -NoBody | Out-Null
    Write-Json (Join-Path $OutDir "req-set.json") @{ defaultCurrency = "USD"; defaultTaxRuleId = $TAX_ID }
    Invoke-Case SET-patch PATCH "$BaseUrl/api/v1/settings" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-set.json") | Out-Null
  }
}

# ----- Invoices -----
if (Test-Want "invoices") {
  $today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
  $due = (Get-Date).ToUniversalTime().AddDays(14).ToString("yyyy-MM-dd")
  Write-Json (Join-Path $OutDir "req-inv.json") @{
    clientId = $CLIENT_ID; templateId = $TEMPLATE_ID; currency = "USD"
    issueDate = $today; dueDate = $due; taxRuleId = $TAX_ID
    items = @(
      @{ name = "Widget"; quantity = 2; unitPrice = 1999; productId = $PRODUCT_ID }
      @{ name = "Consulting"; quantity = 1; unitPrice = 15000; serviceId = $SERVICE_ID }
    )
  }
  $inv = Invoke-Case INV-create POST "$BaseUrl/api/v1/invoices" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-inv.json")
  $INV_ID = ($inv.body | ConvertFrom-Json).data._id
  Invoke-Case INV-get-idor GET "$BaseUrl/api/v1/invoices/$INV_ID" -Token $TOKEN_B -NoBody | Out-Null
  Write-Json (Join-Path $OutDir "req-st-paid.json") @{ status = "paid" }
  Invoke-Case INV-status-from-draft POST "$BaseUrl/api/v1/invoices/$INV_ID/status" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-st-paid.json") | Out-Null
  Invoke-Case INV-publish POST "$BaseUrl/api/v1/invoices/$INV_ID/publish" -Token $TOKEN_A -NoBody | Out-Null
  Write-Json (Join-Path $OutDir "req-inv-notes.json") @{ notes = "Should be allowed on published" }
  Invoke-Case INV-patch-notes-published PATCH "$BaseUrl/api/v1/invoices/$INV_ID" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-inv-notes.json") | Out-Null
  Write-Json (Join-Path $OutDir "req-st-pending.json") @{ status = "pending" }
  Invoke-Case INV-status-pending POST "$BaseUrl/api/v1/invoices/$INV_ID/status" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-st-pending.json") | Out-Null
  Invoke-Case INV-status-paid POST "$BaseUrl/api/v1/invoices/$INV_ID/status" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-st-paid.json") | Out-Null
  Write-Json (Join-Path $OutDir "req-st-arch.json") @{ status = "archived" }
  Invoke-Case INV-status-archived POST "$BaseUrl/api/v1/invoices/$INV_ID/status" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-st-arch.json") | Out-Null
  Invoke-Case INV-duplicate POST "$BaseUrl/api/v1/invoices/$INV_ID/duplicate" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case INV-pdf GET "$BaseUrl/api/v1/invoices/$INV_ID/pdf" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case INV-trash DELETE "$BaseUrl/api/v1/invoices/$INV_ID" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case INV-list-deleted GET "$BaseUrl/api/v1/invoices?includeDeleted=true" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case INV-restore POST "$BaseUrl/api/v1/invoices/$INV_ID/restore" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case INV-list-search-meta GET "$BaseUrl/api/v1/invoices?search=(" -Token $TOKEN_A -NoBody | Out-Null
}

# ----- Dashboard / notifications / subscriptions -----
if (Test-Want "dashboard") {
  Invoke-Case DASH-summary GET "$BaseUrl/api/v1/dashboard/summary" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case DASH-charts GET "$BaseUrl/api/v1/dashboard/charts?range=30d" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case DASH-charts-bad GET "$BaseUrl/api/v1/dashboard/charts?range=1y" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case DASH-activity GET "$BaseUrl/api/v1/dashboard/recent-activity?limit=5" -Token $TOKEN_A -NoBody | Out-Null
}

if (Test-Want "notifications") {
  $n = Invoke-Case NOTIF-list GET "$BaseUrl/api/v1/notifications" -Token $TOKEN_A -NoBody
  Invoke-Case NOTIF-unread GET "$BaseUrl/api/v1/notifications/unread-count" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case NOTIF-read-all PATCH "$BaseUrl/api/v1/notifications/read-all" -Token $TOKEN_A -NoBody | Out-Null
}

if (Test-Want "subscriptions") {
  Invoke-Case SUB-plans GET "$BaseUrl/api/v1/subscriptions/plans" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case SUB-current GET "$BaseUrl/api/v1/subscriptions/current" -Token $TOKEN_A -NoBody | Out-Null
  Invoke-Case SUB-usage GET "$BaseUrl/api/v1/subscriptions/usage" -Token $TOKEN_A -NoBody | Out-Null
  Write-Json (Join-Path $OutDir "req-plan-bad.json") @{ planId = "enterprise" }
  Invoke-Case SUB-change-bad POST "$BaseUrl/api/v1/subscriptions/change-plan" -Token $TOKEN_A -JsonFile (Join-Path $OutDir "req-plan-bad.json") | Out-Null
}

# Persist tokens for MCP follow-up
[System.IO.File]::WriteAllText((Join-Path $OutDir "tokens.env"), @"
TOKEN_A=$TOKEN_A
TOKEN_B=$TOKEN_B
USER_A=$USER_A
CO_A=$CO_A
EMAIL_A=$EMAIL_A
EMAIL_B=$EMAIL_B
EMAIL_LOCK=$EMAIL_LOCK
PASS=$PASS
TAX_ID=$TAX_ID
CLIENT_ID=$CLIENT_ID
PRODUCT_ID=$PRODUCT_ID
SERVICE_ID=$SERVICE_ID
TEMPLATE_ID=$TEMPLATE_ID
TS=$ts
BASE=$BaseUrl
"@)

$count = (Get-Content $LOG | Measure-Object -Line).Lines
Write-Host ""
Write-Host "Done. Cases logged: $count"
Write-Host "Log: $LOG"
Write-Host "Tokens: $(Join-Path $OutDir 'tokens.env')"
Write-Host "Next: verify mutations with MongoDB MCP, then write findings report (see /.cursor/commands/api-audit.md)."
