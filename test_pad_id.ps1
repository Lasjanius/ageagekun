# PAD test with flow ID (need to replace with actual ID)
# Right-click on flow in PAD console and select "Properties" to get ID

# Example: If your flow ID is "12345678-1234-1234-1234-123456789012"
$flowId = "YOUR-FLOW-ID-HERE"  # Replace this with actual flow ID

$inputArgs = @{
    queue_id = 1
    PatientID = 99999999
    BaseDir = "C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999999"
    fileName = "test.pdf"
    Category = "kyotaku"
}

$json = $inputArgs | ConvertTo-Json -Compress
Add-Type -AssemblyName System.Web
$encoded = [System.Web.HttpUtility]::UrlEncode($json)

# Use workflowId instead of workflowName
$url = "ms-powerautomate:/console/flow/run?workflowId=$flowId&inputArguments=$encoded"
Write-Host "URL with ID: $url"

Start-Process $url