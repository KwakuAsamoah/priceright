param(
  [string]$DbPath = "server/priceright.db",
  [string]$OutputPath = "server/migration/sqlite-export.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DbPath)) {
  throw "SQLite DB not found at '$DbPath'"
}

if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) {
  throw "sqlite3 CLI is required but was not found in PATH"
}

$tables = @(
  "currencies",
  "settings",
  "exchange_rates",
  "materials",
  "products",
  "bill_of_materials",
  "material_price_history",
  "price_levels",
  "customers",
  "special_pricing",
  "price_lists",
  "price_list_items"
)

$result = @{}

foreach ($table in $tables) {
  $raw = sqlite3 -json $DbPath "SELECT * FROM $table;"
  if ([string]::IsNullOrWhiteSpace($raw)) {
    $result[$table] = @()
  } else {
    $result[$table] = $raw | ConvertFrom-Json
  }
}

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$result | ConvertTo-Json -Depth 100 | Set-Content -Path $OutputPath -Encoding UTF8

Write-Host "✅ SQLite export complete: $OutputPath"
