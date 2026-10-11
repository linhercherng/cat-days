// Small event-capable DOM fixture; production handlers run unchanged.
export function installDOM(t) {
  class Node {
    constructor(tag='div') {this.tagName=tag;this.children=[];this.listeners=new Map();this.attrs={};this.value='';this.textContent='';this.hidden=false;this.dataset={};}
    setAttribute(key,value) {this.attrs[key]=value;}
    append(...items) {this.children.push(...items);}
    replaceChildren(...items) {this.children=[...items];}
    addEventListener(name,fn) {const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);}
    async emit(name) {for (const fn of this.listeners.get(name)||[]) await fn({preventDefault(){}});}
    click() {return this.emit('click');}
    remove() {}
    focus() {}
  }
  const nodes=new Map();
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};
  const document={querySelector:get,querySelectorAll:()=>[],createElement:tag=>new Node(tag),body:new Node('body')};
  const previous={document:globalThis.document,window:globalThis.window};
  globalThis.document=document;globalThis.window={dispatchEvent(){}};
  t.after(()=>{for(const [key,value] of Object.entries(previous)) {if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  function find(node,predicate) {
    if(node && typeof node==='object') {
      if(predicate(node))return node;
      for(const child of node.children || []) {const result=find(child,predicate);if(result)return result;}
    }
  }
  return {get,document,find,button:(selector,text)=>find(get(selector),n=>n.tagName==='button' && n.children.includes(text))};
}
