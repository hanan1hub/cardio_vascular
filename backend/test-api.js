/**
 * Simple test script to verify API endpoints
 * Run with: node test-api.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testHealthCheck() {
  log('\n🔍 Testing: GET /api/health', 'cyan');
  try {
    const response = await axios.get(`${BASE_URL}/api/health`);
    log(`✅ Health Check: ${response.data.status}`, 'green');
    log(`   Database: ${response.data.database.connected ? 'Connected' : 'Disconnected'}`);
    log(`   Total Readings: ${response.data.database.totalReadings}`);
    return true;
  } catch (error) {
    log(`❌ Health check failed: ${error.message}`, 'red');
    return false;
  }
}

async function testSendReading() {
  log('\n🔍 Testing: POST /api/readings', 'cyan');
  try {
    const testData = {
      deviceId: 'test-device-001',
      hr: 75,
      spo2: 98,
      ecg: [0.5, 0.6, 0.4, 0.7, 0.3],
      ppg: [200, 185, 190, 195, 188]
    };
    
    log('   Sending test reading...');
    const response = await axios.post(`${BASE_URL}/api/readings`, testData);
    
    if (response.data.ok) {
      log('✅ Reading sent successfully', 'green');
      log(`   Device: ${response.data.data.deviceId}`);
      log(`   HR: ${response.data.data.hr} bpm`);
      log(`   SpO2: ${response.data.data.spo2}%`);
      log(`   BP: ${response.data.data.sbp || 'N/A'}/${response.data.data.dbp || 'N/A'} mmHg`);
      if (response.data.warnings && response.data.warnings.length > 0) {
        log(`   ⚠️  Warnings: ${response.data.warnings.join(', ')}`, 'yellow');
      }
      return true;
    }
  } catch (error) {
    log(`❌ Send reading failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function testGetRecentVitals() {
  log('\n🔍 Testing: GET /api/vitals/recent', 'cyan');
  try {
    const response = await axios.get(`${BASE_URL}/api/vitals/recent?minutes=10`);
    
    if (response.data.ok) {
      log('✅ Recent vitals retrieved', 'green');
      log(`   Time Range: ${response.data.data.time_range_minutes} minutes`);
      log(`   Count: ${response.data.data.count} readings`);
      
      if (response.data.data.count > 0) {
        const latest = response.data.data.vitals[0];
        log(`   Latest Reading:`);
        log(`     - Timestamp: ${latest.timestamp}`);
        log(`     - HR: ${latest.hr} bpm`);
        log(`     - SpO2: ${latest.spo2}%`);
      }
      return true;
    }
  } catch (error) {
    log(`❌ Get recent vitals failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function testGetStats() {
  log('\n🔍 Testing: GET /api/vitals/stats', 'cyan');
  try {
    const response = await axios.get(`${BASE_URL}/api/vitals/stats`);
    
    if (response.data.ok) {
      log('✅ Stats retrieved', 'green');
      const stats = response.data.data;
      log(`   Total Readings: ${stats.totalReadings}`);
      log(`   Last 24 Hours: ${stats.last24Hours}`);
      log(`   Last Hour: ${stats.lastHour}`);
      log(`   Devices: ${stats.devices} (${stats.deviceIds.join(', ')})`);
      return true;
    }
  } catch (error) {
    log(`❌ Get stats failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function testSendToDoctor() {
  log('\n🔍 Testing: POST /api/vitals/send-to-doctor', 'cyan');
  try {
    const requestData = {
      minutes: 10,
      format: 'json',
      deviceId: 'test-device-001'
    };
    
    const response = await axios.post(`${BASE_URL}/api/vitals/send-to-doctor`, requestData);
    
    if (response.data.ok) {
      log('✅ Report generated successfully', 'green');
      log(`   Format: ${response.data.format}`);
      if (response.data.data) {
        log(`   Total Readings: ${response.data.data.summary?.total_readings || 0}`);
        if (response.data.file) {
          log(`   File: ${response.data.file.download_url}`);
        }
      }
      return true;
    } else {
      log(`⚠️  Report generation issue: ${response.data.message}`, 'yellow');
      if (response.data.fallback) {
        log(`   Fallback: ${response.data.fallback.action}`, 'yellow');
      }
      return true; // Not a failure if no data available
    }
  } catch (error) {
    if (error.response?.status === 404) {
      log('⚠️  No vitals data available for report (this is expected if no data sent yet)', 'yellow');
      return true;
    }
    log(`❌ Send to doctor failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('='.repeat(60), 'blue');
  log('  Cardio Dashboard API Test Suite', 'blue');
  log('='.repeat(60), 'blue');
  log(`\nTarget: ${BASE_URL}`);
  log(`Time: ${new Date().toISOString()}`);
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  // Run tests
  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Send Reading', fn: testSendReading },
    { name: 'Get Recent Vitals', fn: testGetRecentVitals },
    { name: 'Get Stats', fn: testGetStats },
    { name: 'Send to Doctor', fn: testSendToDoctor }
  ];
  
  for (const test of tests) {
    const passed = await test.fn();
    results.tests.push({ name: test.name, passed });
    if (passed) results.passed++;
    else results.failed++;
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  log('\n' + '='.repeat(60), 'blue');
  log('  Test Summary', 'blue');
  log('='.repeat(60), 'blue');
  
  results.tests.forEach(test => {
    const icon = test.passed ? '✅' : '❌';
    const color = test.passed ? 'green' : 'red';
    log(`${icon} ${test.name}`, color);
  });
  
  log(`\nTotal: ${results.tests.length} tests`);
  log(`Passed: ${results.passed}`, 'green');
  if (results.failed > 0) {
    log(`Failed: ${results.failed}`, 'red');
  }
  
  const allPassed = results.failed === 0;
  log(`\n${allPassed ? '🎉 All tests passed!' : '⚠️  Some tests failed'}`, allPassed ? 'green' : 'yellow');
  
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Test suite error: ${error.message}`, 'red');
  log('\n⚠️  Make sure the backend server is running:', 'yellow');
  log('   cd backend && npm start', 'yellow');
  process.exit(1);
});
