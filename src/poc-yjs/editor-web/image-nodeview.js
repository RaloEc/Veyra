/**
 * image-nodeview.js - Vanilla ProseMirror NodeView para edición táctil de imágenes en móvil
 *
 * Características:
 * - Redimensionamiento táctil ultra fluido en tiempo real vía Touch Events sobre inner imageWrapper (60fps)
 * - Restricción estricta de redimensionamiento: SOLO activo en modo edición (inactivo e invisible en modo lectura)
 * - Soporte dual para touch (móviles) y pointer (desktop/mouse)
 * - Píldora de porcentaje flotante interactiva durante el arrastre
 * - Área de toque expandida en los handles para máxima ergonomía táctil
 * - Cero deltas Yjs durante el arrastre; commit atómico único en touchend / pointerup
 * - Supresión inmediata del foco de teclado en Android/iOS mediante captura en pointerdown
 * - Alineación visual en bloque vía flexbox data-align (left, center, right)
 * - Edición y alternancia de pie de foto (caption) interactiva (input en edición, div estático fuera)
 * - Aislamiento de mutaciones y eventos para no interferir con ProseMirror ni romper selección
 */

import { NodeSelection } from 'prosemirror-state';

export class ImageNodeView {
    constructor(node, view, getPos) {
        this.node = node;
        this.view = view;
        this.getPos = getPos;
        this.isEditingCaption = false;

        this.initDOM();
        this.initSelectionEvents();
        this.initResizeEvents();
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
        // <figure class="veyra-image-node" data-selected="false" data-align="center">
        this.dom = document.createElement('figure');
        this.dom.className = 'veyra-image-node';
        this.dom.dataset.selected = 'false';
        this.dom.style.userSelect = 'none';
        this.dom.style.webkitUserSelect = 'none';
        this.dom.style.margin = '12px 0';
        this.dom.style.width = '100%';
        this.dom._nodeView = this;

        const editable = this.isEditable();
        this.dom.dataset.editable = String(editable);
        this.dom.classList.toggle('is-readonly', !editable);

        const align = this.node.attrs.textAlign || 'center';
        this.dom.dataset.align = align;

        const width = this.node.attrs.width || 100;

        // <div class="veyra-image-wrapper" style="width: X%">
        this.imageWrapper = document.createElement('div');
        this.imageWrapper.className = 'veyra-image-wrapper';
        this.imageWrapper.style.position = 'relative';
        this.imageWrapper.style.maxWidth = '100%';
        this.imageWrapper.style.minWidth = '0';
        this.imageWrapper.style.boxSizing = 'border-box';
        this.imageWrapper.style.borderRadius = '8px';
        this.dom.appendChild(this.imageWrapper);

        // <img> inside imageWrapper
        this.img = document.createElement('img');
        this.img.src = this.node.attrs.src || '';
        if (this.node.attrs.alt) {
            this.img.alt = this.node.attrs.alt;
        }
        this.img.draggable = false;
        this.img.style.width = '100%';
        this.img.style.height = 'auto';
        this.img.style.display = 'block';
        this.img.style.userSelect = 'none';
        this.img.style.webkitUserSelect = 'none';
        this.img.style.webkitTouchCallout = 'none';
        this.img.style.webkitTapHighlightColor = 'transparent';
        this.img.style.pointerEvents = 'auto';

        // Animación suave de carga (Fade-in elegante)
        if (!this.img.complete) {
            this.imageWrapper.classList.add('is-loading');
            this.img.style.opacity = '0';
            this.img.style.transition = 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
            const onLoad = () => {
                this.imageWrapper.classList.remove('is-loading');
                this.img.style.opacity = '1';
            };
            this.img.addEventListener('load', onLoad, { once: true });
            this.img.addEventListener('error', onLoad, { once: true });
        } else {
            this.img.style.opacity = '1';
        }
        this.imageWrapper.appendChild(this.img);

        // Píldora indicadora de porcentaje flotante en resize
        this.pill = document.createElement('div');
        this.pill.className = 'veyra-resize-pill';
        this.imageWrapper.appendChild(this.pill);

        // 4 resize handles en las 4 esquinas de imageWrapper
        this.handles = ['nw', 'ne', 'sw', 'se'].map(pos => {
            const h = document.createElement('div');
            h.className = `resize-handle resize-${pos}`;
            h.dataset.direction = pos;
            this.imageWrapper.appendChild(h);
            return h;
        });

        // <div class="veyra-figcaption-container" style="width: X%">
        this.captionContainer = document.createElement('div');
        this.captionContainer.className = 'veyra-figcaption-container';
        this.dom.appendChild(this.captionContainer);

        this.updateDimensionsAndAlignment(width, align);
        this.renderCaption();
    }

    updateDimensionsAndAlignment(width, align) {
        const w = typeof width === 'number' ? width : (this.node?.attrs?.width || 100);
        const a = align || this.node?.attrs?.textAlign || 'center';
        this.dom.dataset.align = a;

        let marginLeft = '0%';
        if (a === 'center') {
            marginLeft = ((100 - w) / 2) + '%';
        } else if (a === 'right') {
            marginLeft = (100 - w) + '%';
        }

        if (this.imageWrapper) {
            this.imageWrapper.style.width = w + '%';
            this.imageWrapper.style.marginLeft = marginLeft;
        }
        if (this.captionContainer) {
            this.captionContainer.style.width = w + '%';
            this.captionContainer.style.marginLeft = marginLeft;
        }
    }

    initSelectionEvents() {
        const selectNodeAtPos = (e) => {
            const target = e.target;
            if (
                target.closest('.veyra-figcaption-input') ||
                target.closest('.resize-handle') ||
                target.closest('.veyra-figcaption-text')
            ) {
                return;
            }

            // Solo interceptar si el toque ocurrió dentro del wrapper de la imagen o en la propia imagen
            if (target !== this.img && target !== this.imageWrapper && (!this.imageWrapper || !this.imageWrapper.contains(target))) {
                return;
            }

            e.preventDefault();
            e.stopImmediatePropagation();

            // Forzar NodeSelection manualmente
            const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
            if (typeof pos === 'number' && this.view && this.view.state) {
                try {
                    const NodeSel = NodeSelection || this.view.state.selection.constructor;
                    const tr = this.view.state.tr.setSelection(
                        NodeSel.create(this.view.state.doc, pos)
                    );
                    this.view.dispatch(tr);
                } catch (_) {}
            }

            // Blur diferido como red de seguridad (Android a veces asigna foco tardío)
            const blurActive = () => {
                const active = document.activeElement;
                if (active && active.isContentEditable && !active.closest('.veyra-image-node')) {
                    active.blur();
                }
            };
            blurActive();
            setTimeout(blurActive, 0);
            setTimeout(blurActive, 50);
        };

        // CAPTURE phase exclusivamente en el IMG y en el imageWrapper (NO en el figure 100% de ancho)
        this.img.addEventListener('pointerdown', selectNodeAtPos, { capture: true });
        this.imageWrapper.addEventListener('pointerdown', selectNodeAtPos, { capture: true });
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

                const dir = handle.dataset.direction;
                const startX = clientX;
                const startWidthPx = this.imageWrapper.offsetWidth;
                const containerWidthPx = this.dom.offsetWidth || this.dom.parentElement?.offsetWidth || window.innerWidth || 360;
                const textAlign = this.dom.dataset.align || this.node.attrs.textAlign || 'center';
                const isRightHandle = dir === 'ne' || dir === 'se';
                const multiplier = textAlign === 'center' ? 2 : 1;

                let currentPct = this.node.attrs.width || Math.round((startWidthPx / containerWidthPx) * 100);
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
                    pct = Math.max(15, Math.min(100, pct));
                    currentPct = Math.round(pct);

                    // Actualización directa e instantánea del estilo (60fps puros)
                    let marginLeft = '0%';
                    if (textAlign === 'center') {
                        marginLeft = ((100 - currentPct) / 2) + '%';
                    } else if (textAlign === 'right') {
                        marginLeft = (100 - currentPct) + '%';
                    }
                    this.imageWrapper.style.width = currentPct + '%';
                    this.imageWrapper.style.marginLeft = marginLeft;
                    this.captionContainer.style.width = currentPct + '%';
                    this.captionContainer.style.marginLeft = marginLeft;
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

                    // Commit atómico único a ProseMirror / Yjs al soltar
                    const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
                    if (typeof pos === 'number' && this.view && this.view.state) {
                        const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
                            ...this.node.attrs,
                            width: lastAppliedPct,
                            style: `width: ${lastAppliedPct}%; height: auto;`
                        });
                        this.view.dispatch(tr);
                    }
                };

                // Touch listeners (para móviles táctiles con passive: false para bloquear scroll)
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

                // Pointer listeners (para mouse / emulación)
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

                // Registrar listeners en window para garantizar la captura de todo el movimiento
                window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
                window.addEventListener('touchend', onTouchEnd, { capture: true });
                window.addEventListener('touchcancel', onTouchEnd, { capture: true });

                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('pointercancel', onPointerUp);
            };

            // TouchStart directo en el handle (Pipeline táctil nativo)
            handle.addEventListener('touchstart', (e) => {
                if (!this.isEditable()) return;
                if (e.touches && e.touches.length > 0) {
                    startResize(e, e.touches[0].clientX);
                }
            }, { passive: false });

            // PointerDown para mouse o stylus
            handle.addEventListener('pointerdown', (e) => {
                if (!this.isEditable()) return;
                if (e.pointerType === 'touch') {
                    return;
                }
                try {
                    handle.setPointerCapture(e.pointerId);
                } catch (_) {}
                startResize(e, e.clientX);
            });
        });
    }

    renderCaption() {
        this.captionContainer.innerHTML = '';
        const caption = this.node.attrs.caption;
        const hasContent = typeof caption === 'string' && caption.trim().length > 0;

        if (this.isEditingCaption && this.isEditable()) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'veyra-figcaption-input';
            input.placeholder = 'Escribe un pie de foto...';
            input.value = caption || '';

            input.addEventListener('blur', () => {
                this.commitCaption(input.value);
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelCaption();
                }
            });

            this.captionContainer.appendChild(input);

            setTimeout(() => {
                input.focus();
                const len = input.value.length;
                input.setSelectionRange(len, len);
            }, 0);
        } else if (hasContent) {
            const textDiv = document.createElement('div');
            textDiv.className = 'veyra-figcaption-text';
            textDiv.textContent = caption;

            if (this.isEditable()) {
                textDiv.style.cursor = 'text';
                textDiv.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleCaption();
                });
            }

            this.captionContainer.appendChild(textDiv);
        }
    }

    commitCaption(value) {
        if (!this.isEditable()) {
            this.isEditingCaption = false;
            this.renderCaption();
            return;
        }

        const trimmed = (value || '').trim();
        const newCaption = trimmed.length > 0 ? trimmed : null;
        const currentCaption = this.node.attrs.caption || null;

        if (newCaption !== currentCaption) {
            const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
            if (typeof pos === 'number' && this.view && this.view.state) {
                const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
                    ...this.node.attrs,
                    caption: newCaption
                });
                this.view.dispatch(tr);
            }
        }
        this.isEditingCaption = false;
        this.renderCaption();
    }

    cancelCaption() {
        this.isEditingCaption = false;
        this.renderCaption();
    }

    toggleCaption() {
        if (!this.isEditable()) return;
        if (this.isEditingCaption) {
            this.cancelCaption();
        } else {
            this.isEditingCaption = true;
            this.renderCaption();
        }
    }

    applyWidth(pct) {
        const val = pct || 100;
        this.imageWrapper.style.width = `${val}%`;
        this.captionContainer.style.width = `${val}%`;
    }

    applyAlign(align) {
        const a = align || 'center';
        this.dom.dataset.align = a;
    }

    update(node) {
        if (node.type.name !== 'image') return false;
        this.node = node;

        const editable = this.isEditable();
        this.dom.dataset.editable = String(editable);
        this.dom.classList.toggle('is-readonly', !editable);

        if (this.img.src !== (node.attrs.src || '')) {
            this.img.src = node.attrs.src || '';
        }
        if (node.attrs.alt) {
            this.img.alt = node.attrs.alt;
        } else {
            this.img.removeAttribute('alt');
        }

        if (!this.dom.classList.contains('is-resizing')) {
            const width = node.attrs.width || 100;
            const align = node.attrs.textAlign || 'center';
            this.updateDimensionsAndAlignment(width, align);
        }

        if (!this.isEditingCaption) {
            this.renderCaption();
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
        if (this.isEditingCaption) {
            this.cancelCaption();
        }
    }

    stopEvent(event) {
        const target = event.target;
        if (target) {
            if (target.closest && (target.closest('.veyra-figcaption-input') || target.closest('.resize-handle'))) {
                return true;
            }
            if (target.classList && (target.classList.contains('veyra-figcaption-input') || target.classList.contains('resize-handle'))) {
                return true;
            }
        }
        return false;
    }

    ignoreMutation() {
        return true;
    }

    destroy() {
    }
}

export const createImageNodeView = (node, view, getPos) => new ImageNodeView(node, view, getPos);
