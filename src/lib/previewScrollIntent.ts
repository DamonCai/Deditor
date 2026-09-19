/** Only deliberate preview navigation may drive the source editor's viewport.
 * WebKit also emits scroll events when replacing/hydrating a long preview. */
export class PreviewScrollIntent {
  private user = false;
  private document: Document;
  constructor(private root: HTMLElement, private onUserScroll: () => void) {
    this.document = root.ownerDocument;
    for (const name of ["wheel", "touchmove", "pointerdown"]) root.addEventListener(name, this.claim, { passive: true });
    root.addEventListener("keydown", this.key);
    for (const name of ["beforeinput", "pointerdown", "keydown"]) this.document.addEventListener(name, this.releaseOutside, true);
  }
  get active() { return this.user; }
  reset = () => { this.user = false; };
  private claim = () => { this.user = true; this.onUserScroll(); };
  private key = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) this.claim();
  };
  private releaseOutside = (event: Event) => {
    if (!this.root.contains(event.target as Node | null)) this.reset();
  };
  destroy() {
    for (const name of ["wheel", "touchmove", "pointerdown"]) this.root.removeEventListener(name, this.claim);
    this.root.removeEventListener("keydown", this.key);
    for (const name of ["beforeinput", "pointerdown", "keydown"]) this.document.removeEventListener(name, this.releaseOutside, true);
    this.reset();
  }
}
