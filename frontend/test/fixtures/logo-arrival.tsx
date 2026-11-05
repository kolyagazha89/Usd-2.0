import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import LogoShowcase from '../../src/public/LogoShowcase';
function Fixture(){const [active,setActive]=useState(false);return <><button onClick={()=>setActive(true)}>Reveal home</button><section className="u-cinema-hero" style={{position:'relative',height:600,visibility:active?'visible':'hidden'}}><LogoShowcase active={active}/></section></>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
