# PAD test execution script

# Define input parameters
$inputArgs = @{
    queue_id = 1
    PatientID = 99999999
    BaseDir = "C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999999"
    fileName = "test.pdf"
    Category = "kyotaku"
}

# Convert to JSON
$json = $inputArgs | ConvertTo-Json -Compress
Write-Host "JSON: $json"

# URL encode
Add-Type -AssemblyName System.Web
$encoded = [System.Web.HttpUtility]::UrlEncode($json)
Write-Host "Encoded: $encoded"

# Build URL
$url = "ms-powerautomate:/console/flow/run?workflowName=ageagekun_kyotaku&inputArguments=$encoded"
Write-Host "Full URL: $url"

# Execute PAD
Write-Host "Starting PAD..."
Start-Process $url