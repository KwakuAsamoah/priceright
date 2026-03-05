$id = 19
$b1 = '{"materialId":721,"quantity":1}'
Invoke-RestMethod -Uri "http://localhost:3000/api/products/$id/bom" -Method Post -ContentType 'application/json' -Body $b1 | Out-Null
$b2 = '{"materialId":723,"quantity":2}'
Invoke-RestMethod -Uri "http://localhost:3000/api/products/$id/bom" -Method Post -ContentType 'application/json' -Body $b2 | Out-Null
(Invoke-RestMethod -Uri "http://localhost:3000/api/products/$id/bom" -Method Get) | ConvertTo-Json -Depth 5 | Out-File -FilePath $env:TEMP\product_bom.json -Encoding utf8
Write-Output 'BOM_SAVED'
