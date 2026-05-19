# STN onboarding import commands
# Generated at: 2026-05-19T15:29:37.151Z
# Auth header uses PowerShell env var: $env:PAPERCLIP_TOKEN

# Preview
curl.exe --request POST \
  --url 'http://127.0.0.1:3000/api/companies/import/preview' \
  --header 'content-type: application/json' \
  --header "Authorization: Bearer $env:PAPERCLIP_TOKEN" \
  --data-binary '@C:\Users\carso\OneDrive - Tesouro Nacional\Documentos\_paperclip_PublicSector\report\stn\stn-import-request-pilot.json'

# Apply
curl.exe --request POST \
  --url 'http://127.0.0.1:3000/api/companies/import' \
  --header 'content-type: application/json' \
  --header "Authorization: Bearer $env:PAPERCLIP_TOKEN" \
  --data-binary '@C:\Users\carso\OneDrive - Tesouro Nacional\Documentos\_paperclip_PublicSector\report\stn\stn-import-request-pilot.json'
