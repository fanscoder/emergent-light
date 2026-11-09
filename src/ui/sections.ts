export function panelSection(title: string, expanded = false): { root: HTMLDetailsElement; body: HTMLDivElement } {
  const root=document.createElement('details'); root.className='panel-group';
  root.open=expanded;
  const key='emergent-light-section-'+title;
  try { const v=localStorage.getItem(key); if(v!==null) root.open=v==='true'; } catch { /* default */ }
  root.addEventListener('toggle',()=>{try{localStorage.setItem(key,String(root.open));}catch{/* no storage */}});
  const summary=document.createElement('summary'); summary.textContent=title;
  const body=document.createElement('div'); body.className='panel-group-body';
  root.append(summary,body); return {root,body};
}
