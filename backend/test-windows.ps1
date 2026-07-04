# Windows PowerShell Test Script for Cardio Dashboard API
# Run with: .\test-windows.ps1

$BASE_URL = "http://localhost:5000"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Cardio Dashboard API Test Suite" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "Test 1: Health Check" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/health" -Method Get
    Write-Host "✅ Server is running!" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor Gray
    Write-Host "   Database Connected: $($response.database.connected)" -ForegroundColor Gray
    Write-Host "   Total Readings: $($response.database.totalReadings)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Server not running or not reachable" -ForegroundColor Red
    Write-Host "   Make sure to start the server first: npm start" -ForegroundColor Red
    exit 1
}

# Test 2: Send Test Reading
Write-Host "`nTest 2: Send Test Reading" -ForegroundColor Yellow
$testData = @{
    deviceId = "test-device-001"
    hr = 75
    spo2 = 98
    ecg = @(0.5, 0.6, 0.4, 0.7, 0.3)
    ppg = @(200, 185, 190, 195, 188)
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/readings" -Method Post -Body $testData -ContentType "application/json"
    Write-Host "✅ Reading sent successfully!" -ForegroundColor Green
    Write-Host "   Device: $($response.data.deviceId)" -ForegroundColor Gray
    Write-Host "   HR: $($response.data.hr) bpm" -ForegroundColor Gray
    Write-Host "   SpO2: $($response.data.spo2)%" -ForegroundColor Gray
    if ($response.data.sbp) {
        Write-Host "   BP: $($response.data.sbp)/$($response.data.dbp) mmHg" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed to send reading: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Get Recent Vitals
Write-Host "`nTest 3: Get Recent Vitals (last 10 minutes)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/vitals/recent?minutes=10" -Method Get
    Write-Host "✅ Retrieved recent vitals!" -ForegroundColor Green
    Write-Host "   Time Range: $($response.data.time_range_minutes) minutes" -ForegroundColor Gray
    Write-Host "   Count: $($response.data.count) readings" -ForegroundColor Gray
    
    if ($response.data.count -gt 0) {
        $latest = $response.data.vitals[0]
        Write-Host "`n   Latest Reading:" -ForegroundColor Gray
        Write-Host "     Timestamp: $($latest.timestamp)" -ForegroundColor Gray
        Write-Host "     HR: $($latest.hr) bpm" -ForegroundColor Gray
        Write-Host "     SpO2: $($latest.spo2)%" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed to get recent vitals: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Get Stats
Write-Host "`nTest 4: Get Database Statistics" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/vitals/stats" -Method Get
    Write-Host "✅ Retrieved statistics!" -ForegroundColor Green
    Write-Host "   Total Readings: $($response.data.totalReadings)" -ForegroundColor Gray
    Write-Host "   Last 24 Hours: $($response.data.last24Hours)" -ForegroundColor Gray
    Write-Host "   Last Hour: $($response.data.lastHour)" -ForegroundColor Gray
    Write-Host "   Active Devices: $($response.data.devices)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to get stats: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Generate Doctor Report
Write-Host "`nTest 5: Generate Doctor Report" -ForegroundColor Yellow
$reportData = @{
    minutes = 10
    format = "json"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/vitals/send-to-doctor" -Method Post -Body $reportData -ContentType "application/json"
    if ($response.ok) {
        Write-Host "✅ Report generated successfully!" -ForegroundColor Green
        Write-Host "   Format: $($response.format)" -ForegroundColor Gray
        if ($response.data.summary) {
            Write-Host "   Total Readings: $($response.data.summary.total_readings)" -ForegroundColor Gray
        }
        if ($response.file) {
            Write-Host "   Download: $($response.file.download_url)" -ForegroundColor Gray
        }
    } else {
        Write-Host "⚠️  $($response.message)" -ForegroundColor Yellow
    }
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "⚠️  No data available yet (send some readings first)" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Failed to generate report: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  All tests completed!" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "📁 Database location: backend\db\vitals.json" -ForegroundColor Gray
Write-Host "📊 View database: Get-Content backend\db\vitals.json | ConvertFrom-Json" -ForegroundColor Gray
