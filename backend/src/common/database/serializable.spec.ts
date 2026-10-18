import {jest} from '@jest/globals';
import {serializable} from './serializable';

describe('Serializable operation retries',()=>{
 it('retries serialization conflicts and returns the committed result',async()=>{
  const db:any={$transaction:jest.fn<(...args:any[])=>Promise<unknown>>().mockRejectedValueOnce({code:'P2034'}).mockResolvedValueOnce('saved')};
  await expect(serializable(db,async()=> 'saved')).resolves.toBe('saved');
  expect(db.$transaction).toHaveBeenCalledTimes(2);
 });
 it('does not retry arbitrary failures or exceed three attempts',async()=>{
  const db:any={$transaction:jest.fn<(...args:any[])=>Promise<unknown>>().mockRejectedValue({code:'P2034'})};
  await expect(serializable(db,async()=>null)).rejects.toEqual({code:'P2034'});
  expect(db.$transaction).toHaveBeenCalledTimes(3);
  db.$transaction.mockReset().mockRejectedValue(new Error('broken'));
  await expect(serializable(db,async()=>null)).rejects.toThrow('broken');
  expect(db.$transaction).toHaveBeenCalledTimes(1);
 });
});
