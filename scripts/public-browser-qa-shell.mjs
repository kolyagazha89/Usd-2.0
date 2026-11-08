/** The real prerelease ingress occasionally drops a read before the SPA
 * shell mounts. One read-only retry is allowed; persistent failures stay red.
 * This does not change DOM assertions, API checks, snapshots, or test counts.
 */
export async function loadPublicShell(page,url,row){
 const ensure=()=>page.locator('.usd-live,.public-site,.login-page').first().waitFor({state:'visible',timeout:40000});
 try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await ensure();
 }catch(firstError){
  row.shellReadRetried=true;
  console.log('PUBLIC_QA_SHELL_READ_RETRY '+JSON.stringify({route:row.route,width:row.width,errorName:firstError?.name??'ReadError'}));
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await ensure();
 }
}
