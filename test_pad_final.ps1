# Final test for PAD local flow execution

Write-Host "=== Testing PAD Local Flow Execution ==="

# Method 1: URL with autologin
Write-Host "`nMethod 1: URL with autologin parameter"
$url1 = "ms-powerautomate:/console/flow/run?workflowName=ageagekun_kyotaku&autologin=true"
Write-Host "URL: $url1"
Start-Process $url1

Start-Sleep -Seconds 10

if (Test-Path "C:\Users\hyosh\Desktop\ageagekun_debug.log") {
    Write-Host "✅ Success! Log file created."
    Write-Host "Log content:"
    Get-Content "C:\Users\hyosh\Desktop\ageagekun_debug.log"
} else {
    Write-Host "❌ No log file created"
    
    # Method 2: Direct command with different format
    Write-Host "`nMethod 2: Direct PAD.Console.Host.exe"
    & "C:\Program Files (x86)\Power Automate Desktop\dotnet\PAD.Console.Host.exe" "ms-powerautomate:/console/flow/run?workflowName=ageagekun_kyotaku"
    
    Start-Sleep -Seconds 10
    
    if (Test-Path "C:\Users\hyosh\Desktop\ageagekun_debug.log") {
        Write-Host "✅ Success with Method 2!"
        Get-Content "C:\Users\hyosh\Desktop\ageagekun_debug.log"
    } else {
        Write-Host "❌ Still no log file"
        Write-Host "`nPossible issues:"
        Write-Host "1. Confirmation dialog is blocking execution"
        Write-Host "2. Flow name doesn't match exactly"
        Write-Host "3. PAD needs to be signed in"
    }
}