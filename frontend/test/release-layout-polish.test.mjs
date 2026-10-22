import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=p=>readFile(new URL(p,import.meta.url),'utf8');
test('release hero removes distracting English kicker and pause control',async()=>{
 const [home,logo,css]=await Promise.all([source('../src/public/PremiumHome.tsx'),source('../src/public/LogoShowcase.tsx'),source('../src/public/premium-public.css')]);
 assert.doesNotMatch(home,/CAR AUDIO<br\/>COMPETITIONS/);
 assert.doesNotMatch(logo,/className="u-logo-playback"/);
 assert.match(css,/word-spacing:\.09em/);
});
test('inspection and registration fill available viewport width',async()=>{
 const styles=await source('../src/styles.css');
 assert.match(styles,/body \.app-shell \.main \.content>\.page/);
 assert.match(styles,/body \.field-mode \.content>\.page/);
 assert.match(styles,/max-width:none!important;width:100%!important/);
 assert.match(styles,/registration-page-main/);
 assert.match(styles,/registration-layout/);
});
