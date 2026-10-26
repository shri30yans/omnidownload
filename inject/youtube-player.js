/**
 * Runs in the page's own JS world (injected as a file, which YouTube's CSP
 * allows). Posts the current player response to the content script, which
 * cannot see page globals from its isolated world.
 */
(() => {
  const CHANNEL = 'OMNIDOWNLOAD_YT_PLAYER';
  const RETRY_DELAYS_MS = [400, 1200, 2500];

  function readPlayer() {
    const fromPlayer = document.getElementById('movie_player')?.getPlayerResponse?.();
    if (fromPlayer?.streamingData) return fromPlayer;
    return window.ytInitialPlayerResponse ?? null;
  }

  const publish = () => window.postMessage({ channel: CHANNEL, player: readPlayer() }, '*');

  publish();
  RETRY_DELAYS_MS.forEach((ms) => setTimeout(publish, ms));
})();
