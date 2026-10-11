export function timedFetch(fetcher,timeout=20000) {
  return async(input,init={})=>{
    const controller=new AbortController();
    const abort=()=>controller.abort();
    const previous=init.signal;
    if(previous?.aborted)abort();else previous?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeout);
    try{return await fetcher(input,{...init,signal:controller.signal});}
    finally{clearTimeout(timer);previous?.removeEventListener('abort',abort);}
  };
}
