// Simple test script to verify the setup
const axios = require('axios');

async function testBackend() {
  try {
    console.log('Testing backend health...');
    const response = await axios.get('http://localhost:3001/health');
    console.log('✅ Backend is running:', response.data);
    
    console.log('\nTesting auth endpoint...');
    const authResponse = await axios.get('http://localhost:3001/auth/google');
    console.log('✅ Auth endpoint working, got auth URL');
    
  } catch (error) {
    console.error('❌ Backend test failed:', error.message);
    console.log('Make sure to:');
    console.log('1. Copy backend/.env.example to backend/.env');
    console.log('2. Fill in your Google OAuth and OpenAI credentials');
    console.log('3. Run: npm run dev:backend');
  }
}

async function testFrontend() {
  try {
    console.log('\nTesting frontend...');
    const response = await axios.get('http://localhost:3000');
    console.log('✅ Frontend is running');
  } catch (error) {
    console.error('❌ Frontend test failed:', error.message);
    console.log('Make sure to run: npm run dev:frontend');
  }
}

async function runTests() {
  console.log('🧪 VAAI Setup Test\n');
  await testBackend();
  await testFrontend();
  console.log('\n🎉 Setup test complete!');
}

runTests();