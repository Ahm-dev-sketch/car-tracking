import { dispatchSweep } from '../src/server/dispatch/service.ts';

async function main() {
  const result = await dispatchSweep();
  console.log('Dispatch sweep completed:', JSON.stringify(result));
}

main()
  .catch((err) => {
    console.error('Dispatch sweep failed:', err);
    process.exit(1);
  });
