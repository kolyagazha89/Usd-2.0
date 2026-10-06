if (process.env.PREPARE_HISTORICAL_IMPORT !== '1') {
  process.exit(0);
}
require('../../../dist/scripts/prepare-historical-import.js');
