// Manual acceptance: uses the real product component and a real remote service.
import React from 'react';
import {createRoot} from 'react-dom/client';
import HtmlPreview from '../src/components/HtmlPreview';
import {useEditorStore} from '../src/store/editor';
(window as any).__TAURI_INTERNALS__ = {convertFileSrc:(path:string)=>new URL(path,location.href).href,invoke:async()=>undefined};
const content = '<h1>Remote iframe test</h1><iframe title="Remote HTTPBin form" width="900" height="520" src="https://httpbin.org/forms/post"></iframe>';
useEditorStore.setState({tabs:[{id:'remote-frame',filePath:'/generated/remote-frame.html',content,savedContent:content}],activeId:'remote-frame',language:'en'});
createRoot(document.getElementById('root')!).render(<HtmlPreview tabId="remote-frame"/>);
