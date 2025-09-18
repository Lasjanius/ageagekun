# Simple PAD test with minimal parameters

$inputArgs = @{
    queue_id = 1
}

$json = $inputArgs | ConvertTo-Json -Compress
Write-Host "Testing with minimal JSON: $json"

Add-Type -AssemblyName System.Web
$encoded = [System.Web.HttpUtility]::UrlEncode($json)

$url = "ms-powerautomate:/console/flow/run?workflowName=ageagekun_kyotaku&inputArguments=$encoded"
Write-Host "URL: $url"

Start-Process $url