import { Client } from '@hiveio/dhive';
import * as hiveuri from 'hive-uri';

const CLIENT_OPTIONS = { 
  timeout: 3000, 
  failoverThreshold: 15,
  consoleOnFailover: true,
  rebrandedApi: true };
const EXPIRE_TIME = 1000 * 60;

const DEFAULT_SERVER = [
  'https://api.hive.blog',
  'https://rpc.ecency.com',
  'https://anyx.io',
];

let rawClient = new Client(
  [process.env.BROADCAST_URL || 'https://rpc.ecency.com', ...DEFAULT_SERVER],
  CLIENT_OPTIONS,
);

const handler = {
  get(target, prop) {
    if (prop === 'updateClient') {
      return address => {
        rawClient = new Client(address, CLIENT_OPTIONS);
      };
    }
    return rawClient[prop];
  },
};

const client = new Proxy({}, handler);

export async function resolveTransaction(parsed, signer) {
  const props = await client.database.getDynamicGlobalProperties();

  // resolve the decoded tx and params to a signable tx
  const { tx } = hiveuri.resolveTransaction(parsed.tx, parsed.params, {
    /* eslint-disable no-bitwise */
    ref_block_num: props.head_block_number & 0xffff,
    ref_block_prefix: Buffer.from(props.head_block_id, 'hex').readUInt32LE(4),
    expiration: new Date(Date.now() + client.broadcast.expireTime + EXPIRE_TIME)
      .toISOString()
      .slice(0, -5),
    signers: [signer],
    preferred_signer: signer,
  });
  tx.ref_block_num = parseInt(tx.ref_block_num, 10);
  tx.ref_block_prefix = parseInt(tx.ref_block_prefix, 10);

  return tx;
}

export default client;
