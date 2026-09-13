import { Client } from 'xrpl';

const client = new Client('wss://xrplcluster.com/v1');

async function test() {
  try {
    await client.connect();
    console.log('✅ Connected to XRPLCluster');
  } catch (err) {
    console.error('❌ Connection failed:', err);
  } finally {
    await client.disconnect();
  }
}

test();
