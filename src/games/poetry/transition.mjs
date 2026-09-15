// One persistent set of glyphs: measure before layout, invert, then settle in place.
export function capturePoetryCard() {
  const card = document.querySelector('.poetry-card');
  if (!card || !card.getBoundingClientRect().height) return null;
  return {rect:card.getBoundingClientRect(), letters:[...card.querySelectorAll('.poetry-glyph')]
    .map(el=>({el,text:el.textContent,rect:el.getBoundingClientRect()}))};
}
export function animatePoetryCompletion(before, moveLetters, commit, onFinish) {
  const game=document.querySelector('#poetry-game');
  const card=game.querySelector('.poetry-card');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animations=[];
  let done=false, committed=false;
  const apply=()=>{if(!committed){committed=true;commit();}};
  function finish() {
    if(done)return;
    done=true;
    apply();
    animations.forEach(a=>a.cancel());
    window.removeEventListener('resize',finish);
    window.visualViewport?.removeEventListener('resize',finish);
    game.inert=false;
    onFinish();
  }
  function play(el,frames,options={}) {
    const a=el.animate(frames,{duration:280,fill:'both',...options});
    animations.push(a);return a;
  }
  game.inert=true;
  window.addEventListener('resize',finish);
  window.visualViewport?.addEventListener('resize',finish);
  // Fade the actual controls, not a detached clone. Reveals also fade old glyphs.
  const departing=[game.querySelector('#poetry-tiles'),game.querySelector('.poetry-edit-actions')];
  if(!moveLetters) departing.push(game.querySelector('#poetry-slots'));
  const fade=departing.map(el=>play(el,[{opacity:1},{opacity:0}],{duration:reduced?60:100}));
  Promise.allSettled(fade.map(a=>a.finished)).then(()=>{
    if(done)return;
    apply();
    fade.forEach(a=>a.cancel());
    const after=card.getBoundingClientRect();
    const targets=before?.letters.map(l=>l.el.getBoundingClientRect());
    const settling=[];
    if(!reduced && before) {
      const easing='cubic-bezier(.22, 1, .36, 1)';
      const dy=before.rect.top-after.top;
      const marginTop=parseFloat(getComputedStyle(card).marginTop);
      // Animate layout spacing with height so the following button moves with the card.
      settling.push(play(card,[{height:`${before.rect.height}px`,marginTop:`${marginTop+dy}px`},
        {height:`${after.height}px`,marginTop:`${marginTop}px`}],{easing}));
      if(moveLetters) before.letters.forEach((letter,i)=>{
        const to=targets[i];
        settling.push(play(letter.el,[{transform:`translate(${letter.rect.left-to.left}px,${letter.rect.top-to.top-dy}px)`},
          {transform:'translate(0,0)'}],{easing}));
      });
    }
    if(!moveLetters || reduced) settling.push(play(game.querySelector('#poetry-slots'),
      [{opacity:0},{opacity:1}],{duration:reduced?100:180}));
    for(const el of game.querySelectorAll('#poetry-source, #poetry-review, #poetry-title, .poetry-navigation')) {
      settling.push(play(el,[{opacity:0},{opacity:1}],{duration:reduced?100:160,delay:reduced?0:100}));
    }
    Promise.allSettled(settling.map(a=>a.finished)).then(finish);
  });
  return finish;
}

// New content replaces old content inside the same card; navigation stays still.
export function animatePoetryNext(commit, onFinish) {
  const game=document.querySelector('#poetry-game');
  const card=game.querySelector('.poetry-card');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animations=[];
  let done=false, committed=false;
  const apply=()=>{if(!committed){committed=true;commit();}};
  function finish() {
    if(done)return;
    done=true;apply();
    animations.forEach(a=>a.cancel());
    window.removeEventListener('resize',finish);
    window.visualViewport?.removeEventListener('resize',finish);
    game.inert=false;onFinish();
  }
  function play(el, frames, options) {
    const a=el.animate(frames,{fill:'both',...options});animations.push(a);return a;
  }
  const content=()=>[...card.children,game.querySelector('.poetry-navigation'),game.querySelector('#poetry-round'),game.querySelector('#poetry-status')].filter(el=>!el.hidden);
  const before=card.getBoundingClientRect();
  const margin=getComputedStyle(card).marginTop;
  game.inert=true;
  window.addEventListener('resize',finish);
  window.visualViewport?.addEventListener('resize',finish);
  const departing=content().map(el=>play(el,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:`translateY(${reduced?0:-6}px)`}],{duration:reduced?50:110,easing:'ease-in'}));
  Promise.allSettled(departing.map(a=>a.finished)).then(()=>{
    if(done)return;
    // End old transforms before measuring the freshly rendered layout.
    departing.forEach(a=>a.cancel());apply();
    const after=card.getBoundingClientRect();
    const finalMargin=getComputedStyle(card).marginTop;
    const incoming=[];
    if(!reduced) incoming.push(play(card,[{height:`${before.height}px`,marginTop:margin,overflow:'hidden'},
      {height:`${after.height}px`,marginTop:finalMargin,overflow:'hidden'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)'}));
    content().forEach(el=>incoming.push(play(el,[{opacity:0,transform:`translateY(${reduced?0:8}px)`},{opacity:1,transform:'translateY(0)'}],{duration:reduced?70:220,easing:'cubic-bezier(.22,1,.36,1)'})));
    Promise.allSettled(incoming.map(a=>a.finished)).then(finish);
  });
  return finish;
}
