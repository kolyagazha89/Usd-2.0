// Use Playwright's pinned browser by default; managed environments can select
// their installed Chromium and HTTP proxy without modifying the QA scripts.
export function getBrowserLaunchOptions(env=process.env){
 return {
  headless:true,
  ...(env.USD_BROWSER_EXECUTABLE?{executablePath:env.USD_BROWSER_EXECUTABLE}:{}),
  ...(env.USD_BROWSER_PROXY?{proxy:{server:env.USD_BROWSER_PROXY,bypass:'127.0.0.1,localhost'}}:{}),
 };
}
