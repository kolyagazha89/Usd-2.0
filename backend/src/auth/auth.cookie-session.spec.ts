import {jest} from '@jest/globals';
import {AuthController} from './auth.controller';

describe('Same-origin cookie session contract',()=>{
 const keys=['NODE_ENV','AUTH_COOKIE_SAME_SITE','AUTH_COOKIE_PATH','AUTH_REFRESH_BODY_ENABLED'];
 const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 afterEach(()=>{for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key]}});
 it('keeps refresh credential out of JSON and scopes the cookie to the proxy API path',async()=>{
  Object.assign(process.env,{NODE_ENV:'production',AUTH_COOKIE_SAME_SITE:'lax',AUTH_COOKIE_PATH:'/api/auth',AUTH_REFRESH_BODY_ENABLED:'false'});
  const service:any={login:jest.fn<(...args:any[])=>Promise<any>>().mockResolvedValue({accessToken:'access',refreshToken:'secret-refresh',user:{id:'user'}})};
  const controller=new AuthController(service); const res:any={cookie:jest.fn()};
  const output=await controller.login({email:'user@example.invalid',password:'password'},{headers:{},ip:'127.0.0.1'} as any,res);
  expect(output).not.toHaveProperty('refreshToken');
  expect(res.cookie).toHaveBeenCalledWith('usd_refresh_token','secret-refresh',expect.objectContaining({httpOnly:true,secure:true,sameSite:'lax',path:'/api/auth'}));
 });
 it('ignores supplied token bodies in cookie-only mode',async()=>{
  process.env.AUTH_REFRESH_BODY_ENABLED='false';
  const service:any={refresh:jest.fn<(...args:any[])=>Promise<any>>().mockResolvedValue({accessToken:'access',refreshToken:'rotated',user:{id:'user'}})};
  const controller=new AuthController(service);
  const output=await controller.refresh({cookies:{usd_refresh_token:'cookie-token'}} as any,{refreshToken:'body-token'},{cookie:jest.fn()} as any);
  expect(service.refresh).toHaveBeenCalledWith('cookie-token');expect(output).not.toHaveProperty('refreshToken');
 });
});
