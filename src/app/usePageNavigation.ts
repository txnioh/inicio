import { lazy, useEffect, useRef, useState, type ComponentType } from 'react';
import { flushSync } from 'react-dom';

const loadArticle = () => import('./writing/InkArticle');
const LazyArticle = lazy(loadArticle);
const pathname = (url: URL) => url.pathname.replace(/\/+$/, '') || '/';

export default function usePageNavigation() {
  const [page, setPage] = useState<{ path: string; Article: ComponentType; arrived: boolean }>(() => ({
    path: pathname(new URL(location.href)), Article: LazyArticle, arrived: false,
  }));
  const currentPath = useRef(page.path);

  useEffect(() => {
    const scrollPositions = new Map<string, number>();
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    let request = 0;
    let running: ViewTransition | undefined;

    async function navigate(url: URL, fromHistory = false) {
      const nextPath = pathname(url);
      const navigation = ++request;
      scrollPositions.set(currentPath.current, scrollY);
      let Article: ComponentType = LazyArticle;
      try {
        // Load before taking the snapshot so the transition never captures a loading screen.
        if (nextPath === '/writing/ink') Article = (await loadArticle()).default;
      } catch {
        location.assign(url.href);
        return;
      }
      if (navigation !== request) return;
      running?.skipTransition();
      const update = () => {
        if (navigation !== request) return;
        if (!fromHistory) history.pushState(null, '', url);
        currentPath.current = nextPath;
        flushSync(() => setPage({ path: nextPath, Article, arrived: true }));
        const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (target) target.scrollIntoView({ behavior: 'instant' });
        else window.scrollTo({ top: nextPath === '/' || fromHistory ? scrollPositions.get(nextPath) ?? 0 : 0, behavior: 'instant' });
        document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
      };
      if (!document.startViewTransition
        || !matchMedia('(hover: hover) and (pointer: fine)').matches
        || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        update();
        return;
      }
      document.documentElement.dataset.pageTransition = 'true';
      const transition = document.startViewTransition(update);
      running = transition;
      void transition.finished.catch(() => {}).finally(() => {
        if (running === transition) {
          delete document.documentElement.dataset.pageTransition;
          running = undefined;
        }
      });
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || !['/', '/writing/ink'].includes(pathname(url)) || pathname(url) === currentPath.current) return;
      event.preventDefault();
      void navigate(url);
    }

    function onPopState() {
      const url = new URL(location.href);
      if (pathname(url) === currentPath.current) {
        const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (target) target.scrollIntoView({ behavior: 'instant' });
        else window.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }
      void navigate(url, true);
    }

    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    return () => {
      request++;
      running?.skipTransition();
      delete document.documentElement.dataset.pageTransition;
      history.scrollRestoration = previousRestoration;
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);
  return page;
}
