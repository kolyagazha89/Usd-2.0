import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {ensureVenueReturnKeys} from './ensure-return-keys.mjs';

test('persistent venue key is Ed25519, public export only, never regenerate',async()=>{
 const root=await mkdtemp(join(tmpdir(),'usd-venue-keys-'));
 const keys=join(root,'private'),pub=join(root,'export');
 const first=await ensureVenueReturnKeys(keys,pub);
 const privatePem=await readFile(join(keys,'venue-return-private.pem'),'utf8');
 const firstPublic=await readFile(first.publicKey,'utf8');
 assert.equal(createPrivateKey(privatePem).asymmetricKeyType,'ed25519');
 assert.equal(createPublicKey(firstPublic).asymmetricKeyType,'ed25519');
 assert.ok(!firstPublic.includes('PRIVATE KEY'));
 assert.equal((await stat(join(keys,'venue-return-private.pem'))).mode&0o077,0);
 const second=await ensureVenueReturnKeys(keys,pub);
 assert.equal(second.fingerprint,first.fingerprint);
 assert.equal(await readFile(join(keys,'venue-return-private.pem'),'utf8'),privatePem);
 assert.equal(await readFile(join(pub,'USD-Venue-Return-Fingerprint.txt'),'utf8'),first.fingerprint+'\n');
});
test('tampered public export or partial key state is refused without overwriting',async()=>{
 const root=await mkdtemp(join(tmpdir(),'usd-venue-keys-'));
 const keys=join(root,'private'),pub=join(root,'export');
 await ensureVenueReturnKeys(keys,pub);
 await writeFile(join(pub,'USD-Venue-Return-Fingerprint.txt'),'fake\n');
 await assert.rejects(()=>ensureVenueReturnKeys(keys,pub),/другой ключ|повреждённый/);
 const next=join(root,'incomplete');
 await (await import('node:fs/promises')).mkdir(next);
 await writeFile(join(next,'venue-return-private.pem'),'invalid',{mode:0o600});
 await assert.rejects(()=>ensureVenueReturnKeys(next,join(root,'different-export')),/Неполная пара/);
});
test('a symlink in the private key path is rejected',async()=>{
 const root=await mkdtemp(join(tmpdir(),'usd-venue-keys-'));
 const keys=join(root,'keys'),pub=join(root,'export');
 await (await import('node:fs/promises')).mkdir(keys);
 await symlink(keys,join(root,'symlink'));
 await assert.rejects(()=>ensureVenueReturnKeys(join(root,'symlink'),pub),/символических ссылок/);
});
