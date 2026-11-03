import { configurationStillPending } from './pending-configuration';

describe('unfinished competition-day equipment', () => {
 it('requires documentation only for a genuine on-site pending snapshot', () => {
  expect(configurationStillPending(null)).toBe(false);
  expect(configurationStillPending({configurationPending:false})).toBe(false);
  expect(configurationStillPending({configurationPending:true})).toBe(true);
  expect(configurationStillPending({configurationPending:true,postStageCompletion:{}})).toBe(true);
  expect(configurationStillPending({configurationPending:true,postStageCompletion:{versionId:''}})).toBe(true);
  expect(configurationStillPending({configurationPending:true,postStageCompletion:{versionId:'version-2'}})).toBe(false);
 });
});
