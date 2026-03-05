$body = '{"name":"Smoke Test Product","sku":"SMK-1","overheadPercentage":30,"profitMargin":30,"otherDirectCosts":0,"productionMode":"single","batchYield":1,"currentSellingPrice":0,"description":"Created by smoke test","category":"Test"}';
$p = Invoke-RestMethod -Uri 'http://localhost:3000/api/products' -Method Post -ContentType 'application/json' -Body $body;
$p | ConvertTo-Json -Depth 5 | Out-File -FilePath $env:TEMP\created_product.json -Encoding utf8;
Write-Output 'SAVED';
