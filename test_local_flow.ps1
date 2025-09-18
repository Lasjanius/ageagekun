# Test local PAD flow execution

# Method 1: Direct execution without parameters
Write-Host "Testing Method 1: Direct execution"
& "C:\Program Files (x86)\Power Automate Desktop\PAD.Console.Host.exe" run --name "ageagekun_kyotaku"

Start-Sleep -Seconds 5

# Check log
if (Test-Path "C:\Users\hyosh\Desktop\ageagekun_debug.log") {
    Write-Host "Success! Log file created."
    Get-Content "C:\Users\hyosh\Desktop\ageagekun_debug.log"
} else {
    Write-Host "No log file created yet."
}