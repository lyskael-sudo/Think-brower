'use strict';

/**
 * Think-Browser — moniteur réseau unifié.
 *
 * Electron n'autorise qu'un seul écouteur `onBeforeRequest` par session. Ce
 * module installe donc l'écouteur unique : il repère les candidats média puis
 * délègue la décision au bloqueur de publicités lorsqu'il est actif.
 * `onResponseStarted` confirme ensuite le type MIME et la taille réelle.
 *
 * @module main/networkMonitor
 */

/**
 * Coordonne la détection média et le filtrage réseau.
 */
class NetworkMonitor {
  /**
   * @param {object} options
   * @param {Electron.Session} options.session
   * @param {import('./mediaDetector').MediaDetector} options.mediaDetector
   * @param {(media: object) => void} options.onMediaDetected
   */
  constructor({ session, mediaDetector, onMediaDetected }) {
    if (!session) {
      throw new Error('Session Electron manquante.');
    }

    this.session = session;
    this.mediaDetector = mediaDetector;
    this.onMediaDetected = onMediaDetected;

    /** @type {((details: object, callback: Function) => void) | null} */
    this.adBlockHandler = null;

    this.installed = false;
  }

  /**
   * Installe ou remplace l'écouteur réseau unique.
   */
  install() {
    // AdBlock installe son propre écouteur avant que nous ne reprenions la
    // main. On retire explicitement l'écouteur précédent pour garantir qu'un
    // seul listener reste actif, même après plusieurs bascules.
    try {
      this.session.webRequest.onBeforeRequest(null);
    } catch (error) {
      console.warn(
        '[Réseau] Remplacement de l’écouteur impossible :',
        error.message,
      );
    }

    this.session.webRequest.onBeforeRequest(
      { urls: ['<all_urls>'] },
      (details, callback) => {
        try {
          this.mediaDetector.inspect(details);
        } catch (error) {
          console.warn('[Média] Analyse de requête impossible :', error.message);
        }

        if (!this.adBlockHandler) {
          callback({});
          return;
        }

        try {
          this.adBlockHandler(details, callback);
        } catch (error) {
          console.warn(
            '[AdBlock] Décision impossible pour une requête :',
            error.message,
          );
          callback({});
        }
      },
    );

    // La taille et le type MIME ne sont disponibles qu'après réception des
    // en-têtes. On ne clobber pas `onHeadersReceived`, utilisé par AdBlock
    // pour ses règles CSP : `onResponseStarted` suffit pour confirmer le
    // média sans perturber le bloqueur.
    try {
      this.session.webRequest.onResponseStarted(null);
    } catch (error) {
      console.warn(
        '[Réseau] Remplacement de l’écouteur de réponse impossible :',
        error.message,
      );
    }

    this.session.webRequest.onResponseStarted(
      { urls: ['<all_urls>'] },
      (details) => {
        try {
          const media = this.mediaDetector.inspectResponse(details);

          if (media) {
            this.onMediaDetected(media);
          }
        } catch (error) {
          console.warn('[Média] Diffusion impossible :', error.message);
        }
      },
    );

    this.installed = true;
  }

  /**
   * Branche ou débranche le bloqueur, puis réinstalle l'écouteur unifié.
   * @param {((details: object, callback: Function) => void) | null} handler
   */
  setAdBlockHandler(handler) {
    this.adBlockHandler =
      typeof handler === 'function' ? handler : null;
    this.install();
  }

  /**
   * Retire l'écouteur réseau lors de l'arrêt de l'application.
   */
  dispose() {
    this.adBlockHandler = null;

    try {
      this.session.webRequest.onBeforeRequest(null);
    } catch (error) {
      console.warn('[Réseau] Retrait de l’écouteur impossible :', error.message);
    }

    try {
      this.session.webRequest.onResponseStarted(null);
    } catch (error) {
      console.warn(
        '[Réseau] Retrait de l’écouteur de réponse impossible :',
        error.message,
      );
    }

    this.installed = false;
  }
}

module.exports = { NetworkMonitor };
