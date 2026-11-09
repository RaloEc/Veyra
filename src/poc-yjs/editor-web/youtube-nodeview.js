/**
 * youtube-nodeview.js - Vanilla ProseMirror NodeView para edición táctil y reproducción de videos de YouTube en móvil
 *
 * Modo Lectura (!isEditable):
 * - Tocar el video lo reproduce de inmediato con 1 solo toque (monta el iframe con autoplay=1).
 * - Cero handles de redimensionamiento ni menús flotantes.
 *
 * Modo Edición (isEditable):
 * - Tocar el video lo selecciona con contorno y 4 handles táctiles en las esquinas.
 * - Despliega el menú flotante en React Native con presets (50%, 75%, 100%), alineación, botón "Reproducir", botón "Enlace" y "Eliminar".
 * - Redimensionamiento táctil en vivo fluido (60fps) manteniendo la relación de aspecto 16:9.
 * - Commit atómico único a ProseMirror / Yjs al soltar el handle (cero deltas intermedios).
 */

import { NodeSelection } from 'prosemirror-state';

export class YouTubeNodeView {
    constructor(nodeOrProps, view, getPos, editor) {
        if (nodeOrProps && nodeOrProps.node) {
            this.node = nodeOrProps.node;
            this.view = nodeOrProps.view;
            this.getPos = nodeOrProps.getPos;
            this.editor = nodeOrProps.editor;
        } else {
            this.node = nodeOrProps;
            this.view = view;
            this.getPos = getPos;
            this.editor = editor;
        }

        this.activated = false;
        this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        this.imgFailed = false;

        this.initDOM();
        this.initSelectionEvents();
        this.initResizeEvents();

        this.handleOnlineChange = () => {
            this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
            this.imgFailed = false;
            this.render();
        };

        window.addEventListener('online', this.handleOnlineChange);
        window.addEventListener('offline', this.handleOnlineChange);

        this.render();
    }

    isEditable() {
        if (this.view && this.view.editable === false) return false;
        if (typeof document !== 'undefined') {
            if (document.body && document.body.classList.contains('is-readonly')) return false;
            const pm = this.dom && this.dom.closest ? this.dom.closest('.ProseMirror') : null;
            if (pm && pm.getAttribute('contenteditable') === 'false') return false;
        }
        return true;
    }

    initDOM() {
        // <div class="veyra-youtube-node" data-youtube-video="" data-align="center">
        this.dom = document.createElement('div');
        this.dom.className = 'veyra-youtube-node';
        this.dom.setAttribute('data-youtube-video', '');
        this.dom.dataset.selected = 'false';
        this.dom.style.userSelect = 'none';
        this.dom.style.webkitUserSelect = 'none';
        this.dom._nodeView = this;

        const editable = this.isEditable();
        this.dom.dataset.editable = String(editable);
        this.dom.classList.toggle('is-readonly', !editable);

        const align = (this.node && this.node.attrs && this.node.attrs.textAlign) || 'center';
        this.dom.dataset.align = align;

        const width = (this.node && this.node.attrs && this.node.attrs.width) || 100;

        // <div class="veyra-youtube-wrapper" style="width: X%">
        this.videoWrapper = document.createElement('div');
        this.videoWrapper.className = 'veyra-youtube-wrapper';
        this.dom.appendChild(this.videoWrapper);

        this.updateDimensionsAndAlignment(width, align);

        // Píldora de porcentaje flotante durante el resize
        this.pill = document.createElement('div');
        this.pill.className = 'veyra-resize-pill';
        this.videoWrapper.appendChild(this.pill);

        // 4 resize handles en las 4 esquinas del wrapper
        this.handles = ['nw', 'ne', 'sw', 'se'].map(pos => {
            const h = document.createElement('div');
            h.className = `resize-handle resize-${pos}`;
            h.dataset.direction = pos;
            this.videoWrapper.appendChild(h);
            return h;
        });

        // Contenedor interno del contenido (thumbnail / play / iframe)
        this.contentContainer = document.createElement('div');
        this.contentContainer.className = 'yt-content w-full h-full relative';
        this.videoWrapper.appendChild(this.contentContainer);
    }

    updateDimensionsAndAlignment(width, align) {
        const w = typeof width === 'number' ? width : ((this.node && this.node.attrs && this.node.attrs.width) || 100);
        const a = align || (this.node && this.node.attrs && this.node.attrs.textAlign) || 'center';
        this.dom.dataset.align = a;

        let marginLeft = '0%';
        if (a === 'center') {
            marginLeft = ((100 - w) / 2) + '%';
        } else if (a === 'right') {
            marginLeft = (100 - w) + '%';
        }

        if (this.videoWrapper) {
            this.videoWrapper.style.width = w + '%';
            this.videoWrapper.style.marginLeft = marginLeft;
        }
    }

    initSelectionEvents() {
        const handleTap = (e) => {
            const target = e.target;
            if (target && (target.closest('.resize-handle') || target.closest('button') || target.closest('a'))) {
                return;
            }

            // MODO LECTURA: Tocar reproduce de inmediato
            if (!this.isEditable()) {
                this.activate();
                return;
            }

            // MODO EDICIÓN: Tocar selecciona el nodo y abre el menú flotante en React Native
            e.preventDefault();
            e.stopImmediatePropagation();

            const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
            if (typeof window !== 'undefined') {
                window.lastClickedYoutubePos = pos;
                window.suppressYoutubeDismissedUntil = Date.now() + 1500;
            }
            if (typeof pos === 'number' && this.view && this.view.state) {
                try {
                    const NodeSel = NodeSelection || this.view.state.selection.constructor;
                    const tr = this.view.state.tr.setSelection(
                        NodeSel.create(this.view.state.doc, pos)
                    );
                    this.view.dispatch(tr);
                } catch (_) {}
            }

            // Enviar coordenadas y atributos a React Native
            const videoId = (this.node && this.node.attrs && this.node.attrs.videoId) || '';
            const rect = this.videoWrapper.getBoundingClientRect();
            if (typeof window !== 'undefined' && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'YOUTUBE_CLICKED',
                    videoId,
                    rect: {
                        x: rect.left + (rect.width / 2),
                        y: rect.top,
                        width: rect.width,
                        height: rect.height,
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        right: rect.right,
                    },
                    attrs: {
                        width: (this.node && this.node.attrs && this.node.attrs.width) || 100,
                        textAlign: (this.node && this.node.attrs && this.node.attrs.textAlign) || 'center',
                        embed: this.node && this.node.attrs && this.node.attrs.embed !== false
                    }
                }));
            }
        };

        this.videoWrapper.addEventListener('click', handleTap);
    }

    initResizeEvents() {
        this.handles.forEach(handle => {
            let isDragging = false;

            const startResize = (e, clientX) => {
                if (!this.isEditable()) return;

                e.preventDefault();
                e.stopPropagation();

                isDragging = true;
                this.dom.classList.add('is-resizing');

                // Si hay un iframe activo, deshabilitar puntero temporalmente durante el arrastre
                const iframe = this.contentContainer.querySelector('iframe');
                if (iframe) {
                    iframe.style.pointerEvents = 'none';
                }

                const dir = handle.dataset.direction;
                const startX = clientX;
                const startWidthPx = this.videoWrapper.offsetWidth;
                const containerWidthPx = this.dom.offsetWidth || this.dom.parentElement?.offsetWidth || window.innerWidth || 360;
                const textAlign = this.dom.dataset.align || (this.node && this.node.attrs && this.node.attrs.textAlign) || 'center';
                const isRightHandle = dir === 'ne' || dir === 'se';
                const multiplier = textAlign === 'center' ? 2 : 1;

                let currentPct = (this.node && this.node.attrs && this.node.attrs.width) || Math.round((startWidthPx / containerWidthPx) * 100);
                let lastAppliedPct = currentPct;

                if (this.pill) {
                    this.pill.textContent = currentPct + '%';
                }

                const handleMove = (x) => {
                    if (!isDragging || !this.isEditable()) return;
                    const deltaX = x - startX;
                    const effectiveDelta = isRightHandle ? deltaX : -deltaX;
                    const newWidthPx = startWidthPx + (effectiveDelta * multiplier);
                    let pct = (newWidthPx / containerWidthPx) * 100;
                    pct = Math.max(30, Math.min(100, pct));
                    currentPct = Math.round(pct);

                    let marginLeft = '0%';
                    if (textAlign === 'center') {
                        marginLeft = ((100 - currentPct) / 2) + '%';
                    } else if (textAlign === 'right') {
                        marginLeft = (100 - currentPct) + '%';
                    }
                    this.videoWrapper.style.width = currentPct + '%';
                    this.videoWrapper.style.marginLeft = marginLeft;
                    lastAppliedPct = currentPct;

                    if (this.pill) {
                        this.pill.textContent = currentPct + '%';
                    }
                };

                const finishResize = () => {
                    if (!isDragging) return;
                    isDragging = false;

                    cleanup();

                    this.updateDimensionsAndAlignment(lastAppliedPct, textAlign);
                    this.dom.classList.remove('is-resizing');

                    const iframeEl = this.contentContainer.querySelector('iframe');
                    if (iframeEl) {
                        iframeEl.style.removeProperty('pointer-events');
                    }

                    // Commit atómico único a ProseMirror / Yjs
                    const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
                    if (typeof pos === 'number' && this.view && this.view.state) {
                        const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
                            ...this.node.attrs,
                            width: lastAppliedPct
                        });
                        this.view.dispatch(tr);
                    }
                };

                const onTouchMove = (moveEvt) => {
                    moveEvt.preventDefault();
                    if (moveEvt.touches && moveEvt.touches.length > 0) {
                        handleMove(moveEvt.touches[0].clientX);
                    }
                };

                const onTouchEnd = (endEvt) => {
                    endEvt.preventDefault();
                    finishResize();
                };

                const onPointerMove = (moveEvt) => {
                    moveEvt.preventDefault();
                    handleMove(moveEvt.clientX);
                };

                const onPointerUp = (upEvt) => {
                    try {
                        handle.releasePointerCapture(upEvt.pointerId);
                    } catch (_) {}
                    finishResize();
                };

                const cleanup = () => {
                    window.removeEventListener('touchmove', onTouchMove, { capture: true, passive: false });
                    window.removeEventListener('touchend', onTouchEnd, { capture: true });
                    window.removeEventListener('touchcancel', onTouchEnd, { capture: true });

                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                    window.removeEventListener('pointercancel', onPointerUp);
                };

                window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
                window.addEventListener('touchend', onTouchEnd, { capture: true });
                window.addEventListener('touchcancel', onTouchEnd, { capture: true });

                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('pointercancel', onPointerUp);
            };

            handle.addEventListener('touchstart', (e) => {
                if (!this.isEditable()) return;
                if (e.touches && e.touches.length > 0) {
                    startResize(e, e.touches[0].clientX);
                }
            }, { passive: false });

            handle.addEventListener('pointerdown', (e) => {
                if (!this.isEditable()) return;
                if (e.pointerType === 'touch') return;
                try {
                    handle.setPointerCapture(e.pointerId);
                } catch (_) {}
                startResize(e, e.clientX);
            });
        });
    }

    activate() {
        if (!this.isOnline) return;
        this.activated = true;
        this.render();
    }

    render() {
        const videoId = (this.node && this.node.attrs && this.node.attrs.videoId) || '';
        const embed = this.node && this.node.attrs && this.node.attrs.embed !== false;
        const width = (this.node && this.node.attrs && this.node.attrs.width) || 100;
        const align = (this.node && this.node.attrs && this.node.attrs.textAlign) || 'center';

        this.dom.setAttribute('data-video-id', videoId);
        this.dom.setAttribute('data-embed', embed ? 'true' : 'false');
        this.dom.dataset.align = align;

        const editable = this.isEditable();
        this.dom.dataset.editable = String(editable);
        this.dom.classList.toggle('is-readonly', !editable);

        this.videoWrapper.style.width = width + '%';

        // Limpiar contenido interno
        this.contentContainer.innerHTML = '';

        // ESTADO A: embed === false (Enlace de texto)
        if (!embed) {
            this.dom.className = 'veyra-youtube-node relative group inline-block my-1.5';
            this.videoWrapper.style.aspectRatio = 'auto';
            this.videoWrapper.style.background = 'transparent';
            this.videoWrapper.style.width = 'auto';

            const wrapper = document.createElement('span');
            wrapper.className = 'inline-flex items-center gap-2 py-0.5 px-2 rounded border border-veyra-border bg-veyra-card/60 text-sm';

            const a = document.createElement('a');
            a.href = `https://www.youtube.com/watch?v=${videoId}`;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'text-accent underline font-medium hover:text-accent-muted transition-colors truncate max-w-[420px]';
            a.textContent = `https://www.youtube.com/watch?v=${videoId}`;
            a.addEventListener('click', (e) => e.stopPropagation());
            wrapper.appendChild(a);

            if (editable) {
                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'yt-btn-toggle px-1.5 py-0.5 text-[11px] font-medium text-veyra-text hover:text-accent bg-white/10 hover:bg-white/15 rounded transition-colors cursor-pointer';
                toggleBtn.title = 'Mostrar como video';
                toggleBtn.textContent = 'Mostrar como video';
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.editor) {
                        this.editor.chain().focus().toggleYoutubeEmbed().run();
                    }
                });
                wrapper.appendChild(toggleBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'yt-btn-delete px-1.5 py-0.5 text-[11px] font-medium text-red-400 hover:text-red-300 bg-red-500/15 hover:bg-red-500/25 rounded transition-colors cursor-pointer';
                deleteBtn.title = 'Eliminar enlace';
                deleteBtn.textContent = 'Eliminar';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteSelf();
                });
                wrapper.appendChild(deleteBtn);
            }

            this.contentContainer.appendChild(wrapper);
            return;
        }

        this.dom.className = 'veyra-youtube-node relative group';
        this.videoWrapper.style.aspectRatio = '16 / 9';
        this.videoWrapper.style.background = '#000';
        this.videoWrapper.style.width = width + '%';

        // ESTADO OFFLINE
        if (!this.isOnline || this.imgFailed) {
            const offlineDiv = document.createElement('div');
            offlineDiv.className = 'yt-offline';
            offlineDiv.addEventListener('click', (e) => e.stopPropagation());

            const icon = document.createElement('div');
            icon.className = 'yt-offline-icon';
            icon.textContent = '▶';
            offlineDiv.appendChild(icon);

            const title = document.createElement('div');
            title.className = 'yt-offline-text';
            title.textContent = 'Video de YouTube';
            offlineDiv.appendChild(title);

            const sub = document.createElement('div');
            sub.className = 'yt-offline-sub';
            sub.textContent = 'Sin conexión';
            offlineDiv.appendChild(sub);

            const link = document.createElement('a');
            link.href = `https://www.youtube.com/watch?v=${videoId}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `youtube.com/watch?v=${videoId}`;
            link.addEventListener('click', (e) => e.stopPropagation());
            offlineDiv.appendChild(link);

            this.contentContainer.appendChild(offlineDiv);
            return;
        }

        // ESTADO C: embed=true, activado (iframe real con autoplay=1)
        if (this.activated) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            iframe.title = 'Reproductor de YouTube';
            iframe.frameBorder = '0';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            iframe.allowFullscreen = true;
            iframe.setAttribute('allowfullscreen', 'true');
            this.contentContainer.appendChild(iframe);
            return;
        }

        // ESTADO B: embed=true, sin activar (thumbnail con play)
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'w-full h-full cursor-pointer relative';

        const img = document.createElement('img');
        img.className = 'yt-thumbnail';
        img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        img.alt = 'Miniatura del video de YouTube';
        img.loading = 'lazy';
        if (!img.complete) {
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
            img.onload = () => { img.style.opacity = '1'; };
        } else {
            img.style.opacity = '1';
        }
        img.onerror = () => {
            this.imgFailed = true;
            this.render();
        };
        thumbContainer.appendChild(img);

        const play = document.createElement('div');
        play.className = 'yt-play';
        play.innerHTML = `
            <svg viewBox="0 0 68 48" aria-hidden="true">
                <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#ff0000" />
                <path d="M45 24 27 14v20" fill="#ffffff" />
            </svg>
        `;
        thumbContainer.appendChild(play);

        this.contentContainer.appendChild(thumbContainer);
    }

    deleteSelf() {
        if (typeof this.getPos === 'function') {
            const pos = this.getPos();
            if (typeof pos === 'number' && this.editor) {
                this.editor.chain().focus().deleteRange({ from: pos, to: pos + this.node.nodeSize }).run();
                return;
            }
        }
        if (this.editor) {
            this.editor.chain().focus().deleteSelection().run();
        }
    }

    update(node) {
        if (node.type.name !== 'youtube') return false;
        const oldId = this.node && this.node.attrs && this.node.attrs.videoId;
        const newId = node && node.attrs && node.attrs.videoId;
        const oldEmbed = this.node && this.node.attrs && this.node.attrs.embed;
        const newEmbed = node && node.attrs && node.attrs.embed;
        const oldWidth = this.node && this.node.attrs && this.node.attrs.width;
        const newWidth = node && node.attrs && node.attrs.width;
        const oldAlign = this.node && this.node.attrs && this.node.attrs.textAlign;
        const newAlign = node && node.attrs && node.attrs.textAlign;

        this.node = node;

        if (oldId !== newId || oldEmbed !== newEmbed) {
            this.activated = false;
            this.render();
        } else {
            if (!this.dom.classList.contains('is-resizing')) {
                const width = (node.attrs && node.attrs.width) || 100;
                const align = (node.attrs && node.attrs.textAlign) || 'center';
                this.updateDimensionsAndAlignment(width, align);
            }
            const editable = this.isEditable();
            this.dom.dataset.editable = String(editable);
            this.dom.classList.toggle('is-readonly', !editable);
        }
        return true;
    }

    selectNode() {
        const editable = this.isEditable();
        this.dom.dataset.selected = 'true';
        this.dom.dataset.editable = String(editable);
        this.dom.classList.add('is-selected');
        this.dom.classList.toggle('is-readonly', !editable);
    }

    deselectNode() {
        this.dom.dataset.selected = 'false';
        this.dom.classList.remove('is-selected');
    }

    stopEvent(event) {
        const target = event.target;
        if (target && (target.closest('.resize-handle') || target.tagName === 'IFRAME' || target.closest('button') || target.closest('a'))) {
            return true;
        }
        return false;
    }

    ignoreMutation() {
        return true;
    }

    destroy() {
        window.removeEventListener('online', this.handleOnlineChange);
        window.removeEventListener('offline', this.handleOnlineChange);
    }
}

export const createYouTubeNodeView = (nodeOrProps, view, getPos, editor) =>
    new YouTubeNodeView(nodeOrProps, view, getPos, editor);
