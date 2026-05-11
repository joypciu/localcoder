# Test script for localcoder tools
$env:LOCALCODER_SERVER_PASSWORD = "test123"

# Start server in background
Write-Host "Starting localcoder server..."
Start-Process -FilePath "bun" -ArgumentList "run --cwd packages/localcoder src/index.ts serve --port 4096 --hostname 127.0.0.1" -NoNewWindow -PassThru | Out-Null

# Wait for server
Write-Host "Waiting for server to start..."
$attempts = 0
while ($attempts -lt 30) {
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:4096/global/health" -Headers @{Authorization="Basic $( [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('localcoder:test123')) )"}
        if ($resp -eq "ok") { break }
    } catch {}
    Start-Sleep -Seconds 1
    $attempts++
}
if ($attempts -ge 30) { Write-Error "Server failed to start"; exit 1 }

Write-Host "Server is ready. Testing tools..."

# Create session
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('localcoder:test123'))
$session = Invoke-RestMethod -Uri "http://127.0.0.1:4096/session" -Method POST -Headers @{Authorization="Basic $auth"} -Body '{"title":"Test Tools"}' -ContentType "application/json"
$sessionId = $session.id
Write-Host "Created session: $sessionId"

# Test tool prompts
$tests = @(
    @{ name="read"; prompt="read sdk/vscode/package.json"; },
    @{ name="glob"; prompt="glob '**/*.ts' in packages/localcoder/src"; },
    @{ name="grep"; prompt="grep 'ToolCall' in packages/localcoder/src"; },
    @{ name="shell"; prompt="run: echo 'Hello World'"; },
    @{ name="write (dry run)"; prompt="write a test file at /tmp/test.txt with content 'test' (just simulate)"; },
    @{ name="task"; prompt="delegate a simple task to analyze package.json"; }
)

foreach ($test in $tests) {
    Write-Host "`n--- Testing: $($test.name) ---"
    
    # Send message
    $body = @{ parts = @(@{ type = "text"; text = $test.prompt }) } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Uri "http://127.0.0.1:4096/api/session/$sessionId/message" -Method POST -Headers @{Authorization="Basic $auth"} -Body $body -ContentType "application/json" | Out-Null

    # Poll for response (max 30 seconds)
    $start = Get-Date
    $lastMsgCount = 0
    $toolSeen = $false
    
    while ((Get-Date) - $start -lt (New-TimeSpan -Seconds 30)) {
        $msgs = Invoke-RestMethod -Uri "http://127.0.0.1:4096/api/session/$sessionId/message" -Headers @{Authorization="Basic $auth"}
        $assistantMsgs = $msgs.items | Where-Object { $_.type -eq "assistant" }
        
        if ($assistantMsgs.Count -gt $lastMsgCount) {
            $lastMsgCount = $assistantMsgs.Count
            $last = $assistantMsgs[-1]
            
            # Check for tool parts
            $toolParts = $last.content | Where-Object { $_.type -eq "tool" }
            if ($toolParts) {
                $toolSeen = $true
                Write-Host "Tool call detected:"
                foreach ($tp in $toolParts) {
                    Write-Host "  Tool: $($tp.name)"
                    Write-Host "  Status: $($tp.state.status)"
                    if ($tp.state.input) { Write-Host "  Input: $($tp.state.input | ConvertTo-Json -Compress)" }
                    if ($tp.state.content) { Write-Host "  Output: $($tp.state.content | ConvertTo-Json -Compress)" }
                }
            }
            
            # Check if message finished
            if ($last.finish -and $last.finish -ne "tool-calls") {
                Write-Host "Message complete."
                break
            }
        }
        Start-Sleep -Seconds 1
    }
    
    if (-not $toolSeen) {
        Write-Warning "No tool calls observed for $($test.name)"
    }
}

Write-Host "`nAll tests completed. Check output above for tool call details."
Write-Host "Stopping server..."
# Kill server processes
Get-Process -Name bun -ErrorAction SilentlyContinue | Stop-Process -Force
