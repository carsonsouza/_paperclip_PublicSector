# STN onboarding import commands
# Generated at: 2026-05-19T15:27:56.660Z

# Preview
curl.exe --request POST \
  --url 'http://127.0.0.1:3000/api/companies/import/preview' \
  --header 'content-type: application/json' \
  --data-binary '@C:\Users\carso\OneDrive - Tesouro Nacional\Documentos\_paperclip_PublicSector\report\stn\stn-import-request-pilot.json'

# Apply
curl.exe --request POST \
  --url 'http://127.0.0.1:3000/api/companies/import' \
  --header 'content-type: application/json' \
  --data-binary '@C:\Users\carso\OneDrive - Tesouro Nacional\Documentos\_paperclip_PublicSector\report\stn\stn-import-request-pilot.json'
