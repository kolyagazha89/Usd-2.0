/** Fixed upper bound of offline judging permissions, independent of test logins. */
export const VENUE_JUDGE_PERMISSIONS=Object.freeze({
  stages:['view'],
  registrations:['view','create','update'],
  inspections:['view','create','update'],
  results:['view','create'],
  participants:['view','create'],
  cars:['view','create'],
  classes:['view'],
  configurations:['view','create','update'],
  records:['view'],
});
