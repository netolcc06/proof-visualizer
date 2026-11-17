// Run `fn` once `selector` matches an element (portaled content mounts after effects). Returns a cleanup.
export function whenReady(selector: string, fn: (el: Element) => void, maxFrames = 30): () => void {
    let raf = 0;
    let tries = 0;
    const check = () => {
        const el = document.querySelector(selector);
        if (el) fn(el);
        else if (tries++ < maxFrames) raf = requestAnimationFrame(check);
    };
    check();
    return () => cancelAnimationFrame(raf);
}
