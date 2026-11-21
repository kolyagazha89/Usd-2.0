/** Repeat the requested read once. A failed navigation may leave the tab on
 * its previous URL, and a renderer crash requires a new tab altogether. */
export async function loadPublicShell(getPage,url,row){
 const open=async(replace=false)=>{
  const page=await getPage(replace);
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
  if(!response?.ok())throw new Error('Public document returned HTTP '+(response?.status()??'unknown'));
  await page.locator('.usd-live,.public-site,.login-page').first().waitFor({state:'visible',timeout:16000});
  await page.waitForFunction(
   ()=>[...document.querySelectorAll('link[rel="stylesheet"]')].every(link=>link.disabled||link.sheet!==null),
   null,{timeout:10000},
  );
  return page;
 };
 try{
  return await open();
 }catch(firstError){
  row.shellReadRetried=true;
  console.log('PUBLIC_QA_SHELL_READ_RETRY '+JSON.stringify({route:row.route,width:row.width,errorName:firstError?.name??'ReadError'}));
  return open(true);
 }
}
