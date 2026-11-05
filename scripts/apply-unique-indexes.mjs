import pg from 'pg';
const { Client } = pg;

async function run() {
  for (const dbName of ['car_tracking', 'car_tracking_test']) {
    try {
      const client = new Client({ connectionString: `postgresql://postgres:postgres@localhost:5432/${dbName}?schema=public` });
      await client.connect();
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS unique_active_offer_per_booking 
        ON booking_offers (booking_id) 
        WHERE status = 'SENT';

        CREATE UNIQUE INDEX IF NOT EXISTS unique_active_offer_per_driver 
        ON booking_offers (driver_id) 
        WHERE status = 'SENT';
      `);
      console.log('Applied partial unique indexes to', dbName);
      await client.end();
    } catch (e) {
      console.error('Error on', dbName, e.message);
    }
  }
}

run();
