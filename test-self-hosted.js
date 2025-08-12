#!/usr/bin/env node

// Self-hosted Open Lovable Test Suite
// Tests all major functionality without external dependencies

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 30000;

class SelfHostedTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async runTest(name, testFn) {
    console.log(`🧪 Testing: ${name}`);
    try {
      await Promise.race([
        testFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), TEST_TIMEOUT)
        )
      ]);
      console.log(`✅ PASS: ${name}`);
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
    } catch (error) {
      console.log(`❌ FAIL: ${name} - ${error.message}`);
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message });
    }
  }

  async testAppHealth() {
    const response = await fetch(`${BASE_URL}`);
    if (!response.ok) {
      throw new Error(`App not responding: ${response.status}`);
    }
    const html = await response.text();
    if (!html.includes('Open Lovable') && !html.includes('Lovable')) {
      throw new Error('App content not found');
    }
  }

  async testLocalSandboxCreation() {
    const response = await fetch(`${BASE_URL}/api/create-local-sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Sandbox creation failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.sandboxId) {
      throw new Error('Invalid sandbox response');
    }

    // Store sandbox ID for other tests
    this.sandboxId = data.sandboxId;
    console.log(`   📁 Created sandbox: ${data.sandboxId}`);
  }

  async testPlaywrightScraping() {
    // Test with a simple URL that should work
    const testUrl = 'https://example.com';
    
    const response = await fetch(`${BASE_URL}/api/scrape-url-playwright`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: testUrl })
    });

    if (!response.ok) {
      throw new Error(`Scraping failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.content) {
      throw new Error('Invalid scraping response');
    }

    console.log(`   📄 Scraped content length: ${data.content.length} chars`);
  }

  async testPlaywrightScreenshot() {
    const testUrl = 'https://example.com';
    
    const response = await fetch(`${BASE_URL}/api/scrape-screenshot-playwright`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: testUrl })
    });

    if (!response.ok) {
      throw new Error(`Screenshot failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.screenshot) {
      throw new Error('Invalid screenshot response');
    }

    console.log(`   📸 Screenshot captured: ${data.screenshot.length} chars`);
  }

  async testCodeApplication() {
    if (!this.sandboxId) {
      throw new Error('No sandbox available for testing');
    }

    // Test applying simple React code
    const testCode = `<file path="src/TestComponent.jsx">
import React from 'react';

function TestComponent() {
  return (
    <div className="p-4 bg-blue-500 text-white">
      <h1>Test Component</h1>
      <p>This is a test component for self-hosted validation.</p>
    </div>
  );
}

export default TestComponent;
</file>`;

    const response = await fetch(`${BASE_URL}/api/apply-local-code-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        response: testCode,
        isEdit: false 
      })
    });

    if (!response.ok) {
      throw new Error(`Code application failed: ${response.status}`);
    }

    // Read the stream to completion
    let completed = false;
    const reader = response.body.getReader();
    
    while (!completed) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.type === 'complete') {
              completed = true;
              console.log(`   📝 Applied code to: ${data.files.join(', ')}`);
            }
          } catch (e) {
            // Ignore JSON parse errors from partial chunks
          }
        }
      }
    }

    if (!completed) {
      throw new Error('Code application did not complete');
    }
  }

  async testSandboxFileRetrieval() {
    if (!this.sandboxId) {
      throw new Error('No sandbox available for testing');
    }

    const response = await fetch(`${BASE_URL}/api/get-local-sandbox-files`);

    if (!response.ok) {
      throw new Error(`File retrieval failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.files) {
      throw new Error('Invalid file retrieval response');
    }

    const fileCount = Object.keys(data.files).length;
    console.log(`   📂 Retrieved ${fileCount} files from sandbox`);
  }

  async testLocalCommand() {
    if (!this.sandboxId) {
      throw new Error('No sandbox available for testing');
    }

    const response = await fetch(`${BASE_URL}/api/run-local-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'npm --version' })
    });

    if (!response.ok) {
      throw new Error(`Command execution failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error('Command execution returned error');
    }

    console.log(`   💻 Command output: ${data.stdout.trim()}`);
  }

  async testDirectoryStructure() {
    // Check if required directories exist
    try {
      await fs.access('sandboxes');
      console.log('   📁 Sandboxes directory exists');
    } catch {
      throw new Error('Sandboxes directory not found');
    }

    try {
      await fs.access('node_modules');
      console.log('   📦 Node modules installed');
    } catch {
      throw new Error('Node modules not found');
    }

    try {
      await fs.access('package.json');
      const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
      if (!pkg.dependencies.playwright) {
        throw new Error('Playwright not in dependencies');
      }
      console.log('   ✅ Package.json has required dependencies');
    } catch (error) {
      throw new Error(`Package.json issue: ${error.message}`);
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Open Lovable Self-Hosted Test Suite');
    console.log('================================================');

    await this.runTest('Application Health Check', () => this.testAppHealth());
    await this.runTest('Directory Structure', () => this.testDirectoryStructure());
    await this.runTest('Local Sandbox Creation', () => this.testLocalSandboxCreation());
    await this.runTest('Local Command Execution', () => this.testLocalCommand());
    await this.runTest('Code Application', () => this.testCodeApplication());
    await this.runTest('Sandbox File Retrieval', () => this.testSandboxFileRetrieval());
    await this.runTest('Playwright Web Scraping', () => this.testPlaywrightScraping());
    await this.runTest('Playwright Screenshots', () => this.testPlaywrightScreenshot());

    console.log('\n📊 Test Results Summary');
    console.log('======================');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Success Rate: ${Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100)}%`);

    if (this.results.failed === 0) {
      console.log('\n🎉 All tests passed! Your self-hosted Open Lovable is working correctly.');
      console.log('🌐 You can now access it at: http://localhost:3000');
    } else {
      console.log('\n⚠️  Some tests failed. Check the errors above and ensure:');
      console.log('   - The application is running (npm run dev or Docker)');
      console.log('   - All dependencies are installed (npm install)');
      console.log('   - Playwright browsers are installed (npx playwright install)');
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new SelfHostedTester();
  tester.runAllTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

export default SelfHostedTester;