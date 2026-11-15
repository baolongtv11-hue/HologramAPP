export class OrientationManager {
  #overlay; #onPortrait; #resizeHandler; #orientationHandler; #viewportHandler; #active = false;
  constructor({ overlay, onPortrait = () => {} } = {}) {
    if (!overlay) throw new Error('OrientationManager cần overlay element.');
    this.#overlay = overlay; this.#onPortrait = onPortrait;
    this.#resizeHandler = () => this.refresh();
    this.#orientationHandler = () => window.setTimeout(() => this.refresh(), 120);
    this.#viewportHandler = () => this.#syncViewportHeight();
  }
  init(){window.addEventListener('resize',this.#resizeHandler,{passive:true});window.addEventListener('orientationchange',this.#orientationHandler,{passive:true});window.visualViewport?.addEventListener('resize',this.#viewportHandler,{passive:true});this.refresh();}
  refresh(){const portrait=window.matchMedia?.('(orientation: portrait)').matches ?? innerHeight>innerWidth;this.#active=portrait;this.#overlay.classList.toggle('active',portrait);this.#syncViewportHeight();if(portrait)this.#onPortrait();return portrait;}
  #syncViewportHeight(){document.documentElement.style.setProperty('--app-height',`${window.visualViewport?.height || window.innerHeight}px`);}
  get isPortrait(){return this.#active;}
  async lockLandscape(){try{if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{}}
  dispose(){window.removeEventListener('resize',this.#resizeHandler);window.removeEventListener('orientationchange',this.#orientationHandler);window.visualViewport?.removeEventListener('resize',this.#viewportHandler);}
}
