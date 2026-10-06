import React, { useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RichEditor } from 'react-native-pell-rich-editor';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';

interface RichTextEditorSectionProps {
    description: string;
    setDescription?: (desc: string) => void;
    editorRef?: any;
    onFocus?: () => void;
    onBlur?: () => void;
    flat?: boolean;
    isDark?: boolean;
    readOnly?: boolean;
    onCropImage?: (imageUri: string) => void;
    onDragStateChange?: (isDragging: boolean) => void;
    onAutoScroll?: (deltaY: number) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onCursorPosition?: (offsetY: number) => void;
}

/**
 * RichTextEditorSection — Editor enriquecido de alta performance con soporte para manipulación de imágenes estilo Samsung Notes / Word.
 */
export function RichTextEditorSection({
    description,
    setDescription,
    editorRef,
    onFocus,
    onBlur,
    flat,
    readOnly = false,
    onCropImage,
    onDragStateChange,
    onAutoScroll,
    onUndo,
    onRedo,
    onCursorPosition,
}: RichTextEditorSectionProps) {
    const { t } = useTranslation();
    const { colors, typography, radii, isDark, accent } = useVeyraTheme();
    const screenHeight = Dimensions.get('screen').height;
    const calculatedMinHeight = flat ? Math.max(560, screenHeight - 140) : 68;
    const accentColor = accent.primary || '#8B5CF6';
    const internalRef = useRef<any>(null);
    const activeRef = editorRef || internalRef;
    const activeRefHolder = useRef(activeRef);
    activeRefHolder.current = activeRef;

    const injectImageHandlerScript = useCallback(() => {
        const ref = activeRefHolder.current?.current;
        if (!ref) return;
        const script = `
            (function() {
                const ACCENT_COLOR = '${accentColor}';
                const IS_DARK = ${isDark ? 'true' : 'false'};
                const IS_READONLY = ${readOnly ? 'true' : 'false'};
                const SCRIPT_VERSION = 'v42.0';
                const SCREEN_HEIGHT = window.innerHeight || ${Math.round(screenHeight)};
                const TOP_ZONE = 100;
                const BOTTOM_ZONE = 100;

                // Prevenir que Chromium haga scroll interno dentro del WebView (el ScrollView nativo gestiona el scroll)
                try {
                    window.addEventListener('scroll', function() {
                        if (window.scrollY !== 0 || window.scrollX !== 0) {
                            window.scrollTo(0, 0);
                        }
                    }, { passive: false });
                } catch(e) {}

                window.__veyraAccentColor = ACCENT_COLOR;
                window.__veyraIsDark = IS_DARK;
                window.__veyraIsReadOnly = IS_READONLY;

                function removeAllUI() {
                    const ids = ['veyra-img-overlay', 'veyra-img-toolbar', 'veyra-img-mode-menu', 'veyra-drop-indicator'];
                    ids.forEach(function(id) {
                        const el = document.getElementById(id);
                        if (el) el.remove();
                    });
                }

                if (IS_READONLY) {
                    window.__veyraImgHandlerVersion = null;
                    removeAllUI();
                    try {
                        var ed = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor') || document.body;
                        if (ed) {
                            ed.setAttribute('contenteditable', 'false');
                            ed.blur();
                        }
                    } catch (e) {}
                    return;
                }

                if (window.__veyraImgHandlerVersion === SCRIPT_VERSION) {
                    if (typeof window.__veyraRefreshTheme === 'function') {
                        window.__veyraRefreshTheme();
                    }
                    return;
                }
                window.__veyraImgHandlerVersion = SCRIPT_VERSION;
                removeAllUI();

                let currentState = 'IDLE'; // 'IDLE' | 'SELECTED' | 'PRESSING' | 'DRAGGING' | 'RESIZING'
                let activeImg = null;
                let overlay = null;
                let toolbar = null;
                let modeMenu = null;
                let handle = null;
                let dropIndicator = null;

                let startPointerX = 0;
                let startPointerY = 0;
                let currentPointerX = 0;
                let currentPointerY = 0;
                let touchOffsetY = 0;
                let touchOffsetX = 0;
                let activePointerId = null;

                let imgStartDocLeft = 0;
                let imgStartDocTop = 0;

                let resizeStartPointerX = 0;
                let resizeStartWidth = 0;

                let autoScrollTimer = null;
                let autoScrollSpeed = 0;
                let lastBtnTriggerTime = 0;

                function getEditor() {
                    return document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor') || document.body;
                }

                function notifyChange() {
                    const contentEl = getEditor();
                    if (contentEl) {
                        try {
                            const clone = contentEl.cloneNode(true);
                            clone.querySelectorAll('#veyra-img-overlay, #veyra-img-toolbar, #veyra-img-mode-menu, #veyra-drop-indicator, .veyra-free-wrap-obstacle, #veyra-drop-placeholder').forEach(function(el) {
                                el.remove();
                            });
                            const html = clone.innerHTML;
                            if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CONTENT_CHANGE', data: html }));
                            }
                        } catch (err) {}
                    }
                }

                function sendDragState(isDraggingState) {
                    try {
                        const payload = JSON.stringify({ type: isDraggingState ? 'DRAG_START' : 'DRAG_END' });
                        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                            window.ReactNativeWebView.postMessage(payload);
                        }
                    } catch (e) {}
                }

                function dismissKeyboard() {
                    try {
                        if (document.activeElement && typeof document.activeElement.blur === 'function') {
                            document.activeElement.blur();
                        }
                        const sel = window.getSelection();
                        if (sel) sel.removeAllRanges();
                        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DISMISS_KEYBOARD' }));
                        }
                    } catch (e) {}
                }

                function ensureEditorHeight() {
                    const editor = getEditor();
                    if (!editor) return;
                    let maxBottom = 0;
                    const freeImages = editor.querySelectorAll('img[data-mode="front"], img[data-mode="back"], img[data-mode="free"]');
                    freeImages.forEach(function(im) {
                        const top = parseInt(im.style.top, 10) || im.offsetTop || 0;
                        const height = im.offsetHeight || 150;
                        if (top + height > maxBottom) {
                            maxBottom = top + height;
                        }
                    });
                    if (maxBottom > 0) {
                        editor.style.minHeight = Math.max(560, maxBottom + 220) + 'px';
                    }
                }

                function getImageMode(img) {
                    if (!img) return 'wrap';
                    const m = img.getAttribute('data-mode');
                    if (m === 'front' || m === 'back' || m === 'break' || m === 'wrap') {
                        return m;
                    }
                    if (m === 'inline') return 'break';
                    if (m === 'free') return 'front';
                    if (m === 'wrap-left' || m === 'wrap-right') return 'wrap';
                    return 'wrap';
                }

                function applyImageMode(img, mode, side) {
                    if (!img) return;
                    dismissKeyboard();
                    img.setAttribute('data-mode', mode);

                    if (mode === 'front') {
                        img.style.position = 'absolute';
                        img.style.zIndex = '20';
                        img.style.float = 'none';
                        img.style.clear = 'none';
                        img.style.margin = '0';
                        img.style.opacity = '1';
                        img.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)';
                    } else if (mode === 'back') {
                        img.style.position = 'absolute';
                        img.style.zIndex = '1';
                        img.style.float = 'none';
                        img.style.clear = 'none';
                        img.style.margin = '0';
                        img.style.opacity = '0.85';
                        img.style.boxShadow = 'none';
                    } else if (mode === 'wrap') {
                        img.style.position = '';
                        img.style.zIndex = '';
                        img.style.left = '';
                        img.style.top = '';
                        img.style.opacity = '1';
                        img.style.boxShadow = 'none';
                        const activeSide = side || img.getAttribute('data-side') || 'left';
                        img.setAttribute('data-side', activeSide);
                        if (activeSide === 'right') {
                            img.style.float = 'right';
                            img.style.clear = 'right';
                            img.style.margin = '6px 0 10px 16px';
                        } else {
                            img.style.float = 'left';
                            img.style.clear = 'left';
                            img.style.margin = '6px 16px 10px 0';
                        }
                    } else if (mode === 'break' || mode === 'inline') {
                        img.style.position = '';
                        img.style.zIndex = '';
                        img.style.left = '';
                        img.style.top = '';
                        img.style.float = 'none';
                        img.style.clear = 'both';
                        img.style.margin = '16px auto';
                        img.style.display = 'block';
                        img.style.opacity = '1';
                        img.style.boxShadow = 'none';
                    }

                    ensureEditorHeight();
                    setTimeout(function() {
                        updateOverlayPos(img, false);
                        notifyChange();
                    }, 30);
                }

                let lastWrapContainer = null;
                let lastWrapOffset = -1;
                let lastWrapSide = '';

                function hideDropIndicator() {
                    if (dropIndicator) {
                        dropIndicator.style.display = 'none';
                    }
                }

                function getWrapCaretAt(clientX, clientY) {
                    let testX = clientX;
                    if (activeImg && activeImg.isConnected) {
                        const r = activeImg.getBoundingClientRect();
                        if (clientX >= (r.left - 15) && clientX <= (r.right + 15)) {
                            const side = (clientX < (window.innerWidth * 0.5)) ? 'left' : 'right';
                            const ed = getEditor();
                            const edRect = ed ? ed.getBoundingClientRect() : { left: 16, right: window.innerWidth - 16 };
                            if (side === 'left') {
                                testX = Math.min(edRect.right - 20, Math.max(r.right + 25, window.innerWidth * 0.75));
                            } else {
                                testX = Math.max(edRect.left + 20, Math.min(r.left - 25, window.innerWidth * 0.25));
                            }
                        }
                    }

                    let range = null;
                    try {
                        if (document.caretRangeFromPoint) {
                            range = document.caretRangeFromPoint(testX, clientY);
                        } else if (document.caretPositionFromPoint) {
                            const pos = document.caretPositionFromPoint(testX, clientY);
                            if (pos && pos.offsetNode) {
                                range = document.createRange();
                                range.setStart(pos.offsetNode, pos.offset);
                                range.collapse(true);
                            }
                        }
                    } catch(e) {}
                    return range;
                }

                function insertImageAtRange(img, range) {
                    if (!img || !range || !range.startContainer) return;
                    const container = range.startContainer;
                    const offset = range.startOffset;

                    if (img.contains(container)) return;

                    try {
                        if (container.nodeType === 3) { // Text node
                            if (offset > 0 && offset < container.length) {
                                const secondPart = container.splitText(offset);
                                container.parentNode.insertBefore(img, secondPart);
                            } else if (offset === 0) {
                                container.parentNode.insertBefore(img, container);
                            } else {
                                container.parentNode.insertBefore(img, container.nextSibling);
                            }
                        } else if (container.nodeType === 1) { // Element node
                            if (container !== img) {
                                const refChild = (container.childNodes && container.childNodes[offset]) || null;
                                if (refChild !== img) {
                                    container.insertBefore(img, refChild);
                                }
                            }
                        }
                    } catch(err) {
                        try {
                            range.insertNode(img);
                        } catch(e) {}
                    }
                }

                function updateDragPosition(clientX, clientY) {
                    if (!activeImg || currentState !== 'DRAGGING') return;
                    const curMode = getImageMode(activeImg);

                    if (curMode === 'wrap' || curMode === 'break') {
                        hideDropIndicator();
                        activeImg.style.transform = '';

                        if (curMode === 'wrap') {
                            const side = (clientX < (window.innerWidth * 0.5)) ? 'left' : 'right';
                            applyImageMode(activeImg, 'wrap', side);
                        } else {
                            applyImageMode(activeImg, curMode);
                        }

                        // Compensar el offset vertical exacto donde el usuario tocó la imagen
                        // para que el dedo permanezca en la misma altura relativa de la imagen sin que ésta salte hacia abajo
                        const sampleY = clientY - touchOffsetY + 10;
                        const range = getWrapCaretAt(clientX, sampleY);
                        const editor = getEditor();

                        if (range && range.startContainer && editor && editor.contains(range.startContainer)) {
                            if (!activeImg.contains(range.startContainer)) {
                                const container = range.startContainer;
                                const offset = range.startOffset;

                                if (container !== lastWrapContainer || offset !== lastWrapOffset) {
                                    lastWrapContainer = container;
                                    lastWrapOffset = offset;
                                    insertImageAtRange(activeImg, range);
                                }
                            }
                        } else if (editor) {
                            const edRect = editor.getBoundingClientRect();
                            if (sampleY > edRect.bottom - 40 || clientY > edRect.bottom - 40) {
                                if (editor.lastChild !== activeImg) {
                                    editor.appendChild(activeImg);
                                }
                            } else if (sampleY < edRect.top + 30 || clientY < edRect.top + 30) {
                                if (editor.firstChild !== activeImg) {
                                    editor.insertBefore(activeImg, editor.firstChild);
                                }
                            }
                        }

                        updateOverlayPos(activeImg, true);
                    } else {
                        // Free absolute movement (front | back)
                        const dx = clientX - startPointerX;
                        const dy = clientY - startPointerY;
                        activeImg.style.transform = 'translate3d(' + dx + 'px, ' + dy + 'px, 0)';
                        updateOverlayPos(activeImg, true);
                    }
                }

                function updateAutoScrollSpeed(clientY, screenY) {
                    let y = clientY;
                    if (typeof screenY === 'number' && screenY > 0 && screenY <= SCREEN_HEIGHT + 100) {
                        y = screenY;
                    }
                    if (y < TOP_ZONE) {
                        const dist = TOP_ZONE - y;
                        autoScrollSpeed = -Math.min(22, Math.max(5, dist * 0.35));
                    } else if (y > SCREEN_HEIGHT - BOTTOM_ZONE) {
                        const dist = y - (SCREEN_HEIGHT - BOTTOM_ZONE);
                        autoScrollSpeed = Math.min(22, Math.max(5, dist * 0.35));
                    } else {
                        autoScrollSpeed = 0;
                    }

                    if (autoScrollSpeed !== 0 && !autoScrollTimer && currentState === 'DRAGGING') {
                        startAutoScrollLoop();
                    } else if (autoScrollSpeed === 0 && autoScrollTimer) {
                        stopAutoScrollLoop();
                    }
                }

                function startAutoScrollLoop() {
                    if (autoScrollTimer) return;
                    autoScrollTimer = setInterval(function() {
                        if (currentState !== 'DRAGGING' || autoScrollSpeed === 0 || !activeImg) {
                            stopAutoScrollLoop();
                            return;
                        }
                        const deltaY = Math.round(autoScrollSpeed);
                        try {
                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'AUTO_SCROLL',
                                    deltaY: deltaY
                                }));
                            }
                        } catch (e) {}

                        updateDragPosition(currentPointerX, currentPointerY);
                    }, 16);
                }

                function stopAutoScrollLoop() {
                    if (autoScrollTimer) {
                        clearInterval(autoScrollTimer);
                        autoScrollTimer = null;
                    }
                    autoScrollSpeed = 0;
                }

                function setOverlayVisualState(isDragging) {
                    if (!overlay) return;
                    const curAccent = window.__veyraAccentColor || ACCENT_COLOR;
                    if (isDragging) {
                        overlay.style.borderColor = curAccent;
                        overlay.style.borderWidth = '2.5px';
                        overlay.style.borderStyle = 'dashed';
                        overlay.style.outline = '2px solid rgba(139, 92, 246, 0.35)';
                        overlay.style.outlineOffset = '2px';
                        if (handle) handle.style.display = 'none';
                    } else {
                        overlay.style.borderColor = curAccent;
                        overlay.style.borderWidth = '2px';
                        overlay.style.borderStyle = 'solid';
                        overlay.style.outline = 'none';
                        if (handle) handle.style.display = 'block';
                    }
                }

                function updateOverlayPos(img, hideToolbar) {
                    if (!img || !img.isConnected) {
                        if (overlay) overlay.style.display = 'none';
                        if (toolbar) toolbar.style.display = 'none';
                        if (modeMenu) modeMenu.style.display = 'none';
                        return;
                    }
                    if (!overlay || !toolbar) createUI();

                    const rect = img.getBoundingClientRect();
                    overlay.style.left = rect.left + 'px';
                    overlay.style.top = rect.top + 'px';
                    overlay.style.width = rect.width + 'px';
                    overlay.style.height = rect.height + 'px';
                    overlay.style.display = 'block';

                    if (toolbar) {
                        if (hideToolbar) {
                            toolbar.style.display = 'none';
                            if (modeMenu) modeMenu.style.display = 'none';
                        } else {
                            toolbar.style.display = 'flex';
                            let tbTop = rect.bottom + 12;
                            if (tbTop > window.innerHeight - 56) {
                                tbTop = Math.max(8, rect.top - 54);
                            }
                            toolbar.style.top = tbTop + 'px';

                            const screenW = window.innerWidth || document.documentElement.clientWidth || 360;
                            const maxW = Math.max(200, screenW - 16);
                            toolbar.style.maxWidth = maxW + 'px';
                            const tbWidth = Math.min(toolbar.scrollWidth || 340, maxW);
                            let tbLeft = rect.left + (rect.width / 2) - (tbWidth / 2);
                            if (tbLeft < 8) tbLeft = 8;
                            const maxLeft = screenW - tbWidth - 8;
                            if (tbLeft > maxLeft) tbLeft = Math.max(8, maxLeft);
                            toolbar.style.left = tbLeft + 'px';

                            updateToolbarState(img);
                            if (modeMenu && modeMenu.style.display === 'block') {
                                positionModeMenu(toolbar);
                            }
                        }
                    }
                }

                function positionModeMenu(tb) {
                    if (!modeMenu || !tb) return;
                    const tbRect = tb.getBoundingClientRect();
                    let menuTop = tbRect.bottom + 6;
                    if (menuTop + 220 > window.innerHeight) {
                        menuTop = Math.max(8, tbRect.top - 215);
                    }
                    modeMenu.style.top = menuTop + 'px';
                    let menuLeft = tbRect.left + 30;
                    const screenW = window.innerWidth || 360;
                    if (menuLeft + 190 > screenW - 8) {
                        menuLeft = Math.max(8, screenW - 198);
                    }
                    modeMenu.style.left = menuLeft + 'px';
                }

                function toggleModeMenu() {
                    if (!modeMenu) return;
                    if (modeMenu.style.display === 'block') {
                        modeMenu.style.display = 'none';
                    } else {
                        modeMenu.style.display = 'block';
                        positionModeMenu(toolbar);
                        renderModeMenuItems();
                    }
                }

                function setSize(img, size) {
                    if (!img) return;
                    dismissKeyboard();
                    img.style.width = size;
                    img.setAttribute('data-width', size);
                    ensureEditorHeight();
                    setTimeout(function() {
                        updateOverlayPos(img, false);
                        updateToolbarState(img);
                        notifyChange();
                    }, 30);
                }

                function cropImage(img) {
                    if (!img) return;
                    dismissKeyboard();
                    img.setAttribute('data-veyra-editing', 'true');
                    const payload = JSON.stringify({ type: 'CROP_IMAGE', data: img.src });
                    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
                }

                window.__veyraReplaceEditingImage = function(newSrc) {
                    if (!newSrc) return;
                    const editor = getEditor();
                    let targetImg = (editor ? editor.querySelector('img[data-veyra-editing="true"]') : null) || activeImg;
                    if (!targetImg) {
                        targetImg = document.querySelector('img[data-veyra-editing="true"]');
                    }
                    if (targetImg) {
                        targetImg.src = newSrc;
                        targetImg.removeAttribute('data-veyra-editing');
                        activeImg = targetImg;
                        currentState = 'SELECTED';
                        ensureEditorHeight();
                        setTimeout(function() {
                            updateOverlayPos(targetImg, false);
                            updateToolbarState(targetImg);
                            notifyChange();
                        }, 50);
                    }
                };

                // SVGs exactos estilo Google Docs / Word
                const svgWrap = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="6" y2="6"/><line x1="18" y1="6" x2="21" y2="6"/><rect x="7" y="4" width="10" height="11" rx="1.5" fill="currentColor" fill-opacity="0.2"/><line x1="3" y1="10" x2="6" y2="10"/><line x1="18" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="6" y2="14"/><line x1="18" y1="14" x2="21" y2="14"/><line x1="3" y1="19" x2="21" y2="19"/></svg>';
                const svgBreak = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="4" x2="21" y2="4"/><rect x="6" y="8" width="12" height="8" rx="1.5" fill="currentColor" fill-opacity="0.2"/><line x1="3" y1="20" x2="21" y2="20"/></svg>';
                const svgBack = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="4" width="14" height="16" rx="2" fill="currentColor" fill-opacity="0.25"/><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></svg>';
                const svgFront = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="7" x2="5" y2="7"/><line x1="19" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="5" y2="17"/><line x1="19" y1="17" x2="21" y2="17"/><rect x="6" y="5" width="12" height="14" rx="2" fill="currentColor" fill-opacity="0.2"/></svg>';
                const svgCheck = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                const svgEdit = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
                const svgTrash = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FB7185" stroke-width="2.3" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                const svgChevronDown = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

                const MODE_OPTIONS = [
                    { key: 'wrap', label: 'Ajustar texto', icon: svgWrap },
                    { key: 'break', label: 'Dividir texto', icon: svgBreak },
                    { key: 'back', label: 'Detrás del texto', icon: svgBack },
                    { key: 'front', label: 'Delante del texto', icon: svgFront },
                ];

                function getModeMeta(modeKey) {
                    for (let i = 0; i < MODE_OPTIONS.length; i++) {
                        if (MODE_OPTIONS[i].key === modeKey) return MODE_OPTIONS[i];
                    }
                    return MODE_OPTIONS[0]; // Ajustar texto por defecto
                }

                function renderModeMenuItems() {
                    if (!modeMenu || !activeImg) return;
                    modeMenu.innerHTML = '';
                    const curMode = getImageMode(activeImg);
                    const curDark = (window.__veyraIsDark !== undefined) ? window.__veyraIsDark : IS_DARK;
                    const curAccent = window.__veyraAccentColor || ACCENT_COLOR;

                    MODE_OPTIONS.forEach(function(opt) {
                        const row = document.createElement('div');
                        const isSelected = (curMode === opt.key);
                        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; height:38px; padding:0 12px; cursor:pointer; user-select:none; -webkit-user-select:none; border-radius:8px; margin-bottom:2px; font-size:13px; font-weight:600; color:' + (isSelected ? curAccent : (curDark ? '#F1F5F9' : '#0F172A')) + '; background:' + (isSelected ? (curDark ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.10)') : 'transparent') + ';';

                        const leftSide = document.createElement('div');
                        leftSide.style.cssText = 'display:flex; align-items:center; gap:10px;';
                        leftSide.innerHTML = opt.icon + '<span>' + opt.label + '</span>';

                        row.appendChild(leftSide);
                        if (isSelected) {
                            const rightSide = document.createElement('div');
                            rightSide.innerHTML = svgCheck;
                            row.appendChild(rightSide);
                        }

                        row.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            modeMenu.style.display = 'none';
                            applyImageMode(activeImg, opt.key);
                        });

                        modeMenu.appendChild(row);
                    });
                }

                function updateToolbarState(img) {
                    if (!toolbar || !img) return;
                    const curAccent = window.__veyraAccentColor || ACCENT_COLOR;
                    const curDark = (window.__veyraIsDark !== undefined) ? window.__veyraIsDark : IS_DARK;
                    const curMode = getImageMode(img);
                    const curWidth = (img.style.width || img.getAttribute('data-width') || '75%').trim();
                    const meta = getModeMeta(curMode);

                    const editBtn = toolbar.querySelector('[data-role="edit"]');
                    if (editBtn) {
                        editBtn.style.background = curDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
                        editBtn.style.color = curDark ? '#F1F5F9' : '#0F172A';
                    }

                    const modeBtn = toolbar.querySelector('[data-role="mode-btn"]');
                    if (modeBtn) {
                        modeBtn.innerHTML = meta.icon + '<span style="font-size:11px;font-weight:700;margin-left:5px;margin-right:4px;">' + meta.label + '</span>' + svgChevronDown;
                        modeBtn.style.background = curAccent;
                        modeBtn.style.color = '#FFFFFF';
                    }

                    toolbar.querySelectorAll('[data-role="size"]').forEach(function(btn) {
                        const val = btn.getAttribute('data-val');
                        const isActive = (curWidth === val) || (val === '75%' && (!curWidth || curWidth === '75%'));
                        btn.style.background = isActive ? curAccent : (curDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)');
                        btn.style.color = isActive ? '#FFFFFF' : (curDark ? '#F1F5F9' : '#0F172A');
                    });
                }

                function makeSafeBtn(html, onClick, role, val, title) {
                    const curDark = (window.__veyraIsDark !== undefined) ? window.__veyraIsDark : IS_DARK;
                    const b = document.createElement('button');
                    b.innerHTML = html;
                    b.style.cssText = 'display:inline-flex; flex-shrink:0; align-items:center; justify-content:center; height:32px; padding:0 8px; border-radius:8px; background:' + (curDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)') + '; color:' + (curDark ? '#F1F5F9' : '#0F172A') + '; border:none; cursor:pointer; touch-action:manipulation; user-select:none; -webkit-user-select:none;';
                    if (role) b.setAttribute('data-role', role);
                    if (val) b.setAttribute('data-val', val);
                    if (title) b.setAttribute('title', title);

                    let btnTouchMoved = false;

                    const trigger = function() {
                        const now = Date.now();
                        if (now - lastBtnTriggerTime < 350) return;
                        lastBtnTriggerTime = now;
                        dismissKeyboard();
                        onClick();
                    };

                    b.addEventListener('touchstart', function(e) {
                        e.stopPropagation();
                        btnTouchMoved = false;
                    }, { passive: true });

                    b.addEventListener('touchmove', function() {
                        btnTouchMoved = true;
                    }, { passive: true });

                    b.addEventListener('touchend', function(e) {
                        e.stopPropagation();
                        if (!btnTouchMoved) {
                            e.preventDefault();
                            trigger();
                        }
                        btnTouchMoved = false;
                    }, { passive: false });

                    b.onclick = function(e) {
                        if (e) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        if (!btnTouchMoved) {
                            trigger();
                        }
                        btnTouchMoved = false;
                    };
                    return b;
                }

                function setEditorEditable(editable) {
                    if (window.__veyraIsReadOnly) {
                        try {
                            var ed = getEditor();
                            if (ed) {
                                ed.setAttribute('contenteditable', 'false');
                                ed.blur();
                            }
                        } catch (e) {}
                        return;
                    }
                    try {
                        var ed = getEditor();
                        if (ed) {
                            ed.setAttribute('contenteditable', editable ? 'true' : 'false');
                        }
                    } catch (e) {}
                }

                function findImageAtPoint(x, y) {
                    if (activeImg && activeImg.isConnected) {
                        var ar = activeImg.getBoundingClientRect();
                        if (x >= (ar.left - 6) && x <= (ar.right + 6) && y >= (ar.top - 6) && y <= (ar.bottom + 6)) {
                            return activeImg;
                        }
                    }
                    var el = null;
                    try {
                        el = document.elementFromPoint(x, y);
                    } catch (e) {}
                    if (el) {
                        if (el.tagName === 'IMG') return el;
                        var cl = el.closest('img');
                        if (cl) return cl;
                    }
                    var imgs = document.querySelectorAll('img');
                    for (var i = imgs.length - 1; i >= 0; i--) {
                        var im = imgs[i];
                        if (!im.isConnected) continue;
                        var r = im.getBoundingClientRect();
                        if (x >= (r.left - 6) && x <= (r.right + 6) && y >= (r.top - 6) && y <= (r.bottom + 6)) {
                            return im;
                        }
                    }
                    return null;
                }

                function cancelSelectionAndKeyboard() {
                    try {
                        var sel = window.getSelection();
                        if (sel) {
                            sel.removeAllRanges();
                            if (typeof sel.empty === 'function') sel.empty();
                        }
                        if (document.activeElement && typeof document.activeElement.blur === 'function') {
                            document.activeElement.blur();
                        }
                        var ed = getEditor();
                        if (ed && typeof ed.blur === 'function') {
                            ed.blur();
                        }
                        dismissKeyboard();
                    } catch (e) {}
                }

                function enforceAllImages() {
                    try {
                        var imgs = document.querySelectorAll('img');
                        imgs.forEach(function(im) {
                            im.setAttribute('contenteditable', 'false');
                            im.setAttribute('draggable', 'false');
                            im.style.userSelect = 'none';
                            im.style.webkitUserSelect = 'none';
                            im.style.webkitTouchCallout = 'none';
                            im.style.touchAction = 'none';
                        });
                    } catch (e) {}
                }

                function createUI() {
                    if (document.getElementById('veyra-img-overlay')) return;
                    const curAccent = window.__veyraAccentColor || ACCENT_COLOR;
                    const curDark = (window.__veyraIsDark !== undefined) ? window.__veyraIsDark : IS_DARK;

                    overlay = document.createElement('div');
                    overlay.id = 'veyra-img-overlay';
                    overlay.style.cssText = 'position:fixed; border:2px solid ' + curAccent + '; border-radius:10px; pointer-events:auto; z-index:99999; box-sizing:border-box; display:none; touch-action:none; cursor:move; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none;';

                    handle = document.createElement('div');
                    handle.id = 'veyra-img-handle';
                    handle.style.cssText = 'position:absolute; bottom:-10px; right:-10px; width:22px; height:22px; border-radius:11px; background:' + curAccent + '; border:2.5px solid #FFFFFF; pointer-events:auto; cursor:nwse-resize; z-index:100002; touch-action:none;';

                    handle.addEventListener('pointerdown', function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        cancelSelectionAndKeyboard();
                        setEditorEditable(false);
                        currentState = 'RESIZING';
                        resizeStartPointerX = ev.clientX;
                        resizeStartWidth = activeImg ? activeImg.offsetWidth : 100;
                        try {
                            handle.setPointerCapture(ev.pointerId);
                        } catch (err) {}
                        if (toolbar) toolbar.style.display = 'none';
                        if (modeMenu) modeMenu.style.display = 'none';
                        sendDragState(true);
                    }, { passive: false });

                    handle.addEventListener('pointermove', function(ev) {
                        if (currentState === 'RESIZING' && activeImg) {
                            ev.preventDefault();
                            ev.stopPropagation();
                            const delta = ev.clientX - resizeStartPointerX;
                            const maxW = (document.body.clientWidth || window.innerWidth) - 16;
                            const newW = Math.max(60, Math.min(maxW, resizeStartWidth + delta));
                            activeImg.style.width = newW + 'px';
                            activeImg.setAttribute('data-width', newW + 'px');
                            ensureEditorHeight();
                            updateOverlayPos(activeImg, true);
                        }
                    }, { passive: false });

                    function endResize() {
                        if (currentState === 'RESIZING') {
                            currentState = 'SELECTED';
                            sendDragState(false);
                            ensureEditorHeight();
                            setEditorEditable(false);
                            if (activeImg) updateOverlayPos(activeImg, false);
                            if (toolbar) toolbar.style.display = 'flex';
                            notifyChange();
                        }
                    }

                    handle.addEventListener('pointerup', endResize);
                    handle.addEventListener('pointercancel', endResize);
                    handle.addEventListener('lostpointercapture', endResize);

                    overlay.appendChild(handle);
                    document.body.appendChild(overlay);

                    toolbar = document.createElement('div');
                    toolbar.id = 'veyra-img-toolbar';
                    toolbar.style.cssText = 'position:fixed; display:none; align-items:center; background:' + (curDark ? '#1E222D' : '#FFFFFF') + '; border:1.5px solid ' + (curDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)') + '; border-radius:14px; padding:5px 6px; gap:5px; z-index:100001; pointer-events:auto; max-width:calc(100vw - 16px); overflow-x:auto; overflow-y:hidden; -webkit-overflow-scrolling:touch; white-space:nowrap; box-sizing:border-box; scrollbar-width:none; box-shadow:0 6px 20px rgba(0,0,0,0.18);';

                    modeMenu = document.createElement('div');
                    modeMenu.id = 'veyra-img-mode-menu';
                    modeMenu.style.cssText = 'position:fixed; display:none; flex-direction:column; background:' + (curDark ? '#1E222D' : '#FFFFFF') + '; border:1.5px solid ' + (curDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)') + '; border-radius:12px; padding:6px; z-index:100003; pointer-events:auto; width:200px; box-shadow:0 10px 28px rgba(0,0,0,0.25);';
                    document.body.appendChild(modeMenu);

                    toolbar.appendChild(makeSafeBtn(svgEdit + '<span style="font-size:11px;font-weight:700;margin-left:4px;">Editar</span>', function() {
                        if (activeImg) cropImage(activeImg);
                    }, 'edit', null, 'Editar imagen'));

                    toolbar.appendChild(makeSafeBtn(svgWrap + '<span style="font-size:11px;font-weight:700;margin-left:4px;margin-right:4px;">Ajustar texto</span>' + svgChevronDown, function() {
                        toggleModeMenu();
                    }, 'mode-btn', null, 'Ajuste de texto'));

                    toolbar.appendChild(makeSafeBtn('<span style="font-size:11px;font-weight:700;">100%</span>', function() { setSize(activeImg, '100%'); }, 'size', '100%', 'Ancho Completo'));
                    toolbar.appendChild(makeSafeBtn('<span style="font-size:11px;font-weight:700;">75%</span>', function() { setSize(activeImg, '75%'); }, 'size', '75%', '75%'));
                    toolbar.appendChild(makeSafeBtn('<span style="font-size:11px;font-weight:700;">50%</span>', function() { setSize(activeImg, '50%'); }, 'size', '50%', '50%'));

                    toolbar.appendChild(makeSafeBtn(svgTrash + '<span style="font-size:11px;font-weight:700;margin-left:4px;color:#FB7185;">Eliminar</span>', function() {
                        if (activeImg) {
                            activeImg.remove();
                            overlay.style.display = 'none';
                            toolbar.style.display = 'none';
                            if (modeMenu) modeMenu.style.display = 'none';
                            activeImg = null;
                            currentState = 'IDLE';
                            setEditorEditable(true);
                            notifyChange();
                        }
                    }, 'delete', null, 'Eliminar'));

                    document.body.appendChild(toolbar);
                }

                function recoverDrag() {
                    stopAutoScrollLoop();
                    hideDropIndicator();
                    if (currentState === 'DRAGGING' || currentState === 'PRESSING') {
                        currentState = 'SELECTED';
                        setOverlayVisualState(false);
                        sendDragState(false);
                        if (activeImg) {
                            activeImg.style.transform = '';
                            updateOverlayPos(activeImg, false);
                        }
                        if (toolbar) toolbar.style.display = 'flex';
                    }
                }

                // Prevenir menú contextual nativo ("Copiar, Seleccionar todo") al mantener pulsada una imagen
                window.addEventListener('contextmenu', function(e) {
                    var touch = (e.touches && e.touches[0]) || e;
                    var img = findImageAtPoint(touch.clientX || e.clientX, touch.clientY || e.clientY);
                    var isOverlayTarget = overlay && (e.target === overlay || overlay.contains(e.target));
                    if (img || isOverlayTarget || activeImg || currentState !== 'IDLE') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                }, true);

                window.addEventListener('selectstart', function(e) {
                    if (e.target.tagName === 'IMG' || e.target.closest('img') || (overlay && (e.target === overlay || overlay.contains(e.target))) || activeImg || currentState !== 'IDLE') {
                        e.preventDefault();
                        return false;
                    }
                }, true);

                window.addEventListener('dragstart', function(e) {
                    if (e.target.tagName === 'IMG' || e.target.closest('img') || (overlay && (e.target === overlay || overlay.contains(e.target))) || activeImg || currentState !== 'IDLE') {
                        e.preventDefault();
                        return false;
                    }
                }, true);

                document.addEventListener('selectionchange', function() {
                    if (currentState !== 'IDLE' || activeImg) {
                        try {
                            var sel = window.getSelection();
                            if (sel && sel.rangeCount > 0) {
                                sel.removeAllRanges();
                            }
                        } catch (e) {}
                    }
                });

                // Previene que Android WebView inicie el temporizador nativo de selección de texto y lupa
                function onTouchStartCapture(e) {
                    if (!e.touches || e.touches.length > 1) return;
                    var t = e.touches[0];
                    if (toolbar && toolbar.contains(e.target)) return;
                    if (modeMenu && modeMenu.contains(e.target)) return;
                    if (handle && handle.contains(e.target)) {
                        e.preventDefault();
                        cancelSelectionAndKeyboard();
                        setEditorEditable(false);
                        return;
                    }

                    var isOverlayTarget = overlay && (e.target === overlay || overlay.contains(e.target));
                    var img = findImageAtPoint(t.clientX, t.clientY);

                    if (img || (isOverlayTarget && activeImg)) {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelSelectionAndKeyboard();
                        setEditorEditable(false);
                        enforceAllImages();
                    }
                }
                window.addEventListener('touchstart', onTouchStartCapture, { capture: true, passive: false });
                document.addEventListener('touchstart', onTouchStartCapture, { capture: true, passive: false });

                window.addEventListener('touchmove', function(e) {
                    if (currentState === 'PRESSING' || currentState === 'DRAGGING' || currentState === 'RESIZING') {
                        e.preventDefault();
                    }
                }, { capture: true, passive: false });

                window.addEventListener('touchend', function(e) {
                    if (currentState === 'PRESSING' || currentState === 'DRAGGING' || currentState === 'RESIZING') {
                        e.preventDefault();
                    }
                }, { capture: true, passive: false });

                // Global Pointer Listeners
                function onPointerDownCapture(e) {
                    if (window.__veyraIsReadOnly) {
                        removeAllUI();
                        setEditorEditable(false);
                        return;
                    }
                    if (currentState === 'RESIZING') return;
                    if (handle && handle.contains(e.target)) return;
                    if (toolbar && toolbar.contains(e.target)) return;
                    if (modeMenu && modeMenu.contains(e.target)) return;

                    var isOverlayTarget = (overlay && (e.target === overlay || overlay.contains(e.target))) && activeImg;
                    var img = findImageAtPoint(e.clientX, e.clientY);

                    if (img || isOverlayTarget) {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelSelectionAndKeyboard();
                        setEditorEditable(false);

                        var targetImg = img || activeImg;
                        activeImg = targetImg;
                        targetImg.setAttribute('draggable', 'false');
                        targetImg.setAttribute('contenteditable', 'false');
                        createUI();
                        if (modeMenu) modeMenu.style.display = 'none';
                        updateOverlayPos(activeImg, true);

                        startPointerX = e.clientX;
                        startPointerY = e.clientY;
                        currentPointerX = e.clientX;
                        currentPointerY = e.clientY;
                        activePointerId = e.pointerId;
                        stopAutoScrollLoop();

                        var activeRect = activeImg.getBoundingClientRect();
                        touchOffsetY = Math.max(0, Math.min(activeRect.height, e.clientY - activeRect.top));
                        touchOffsetX = Math.max(0, Math.min(activeRect.width, e.clientX - activeRect.left));

                        imgStartDocLeft = parseInt(activeImg.style.left, 10) || activeImg.offsetLeft || 0;
                        imgStartDocTop = parseInt(activeImg.style.top, 10) || activeImg.offsetTop || 0;

                        if (overlay && e.pointerId && typeof overlay.setPointerCapture === 'function') {
                            try {
                                overlay.setPointerCapture(e.pointerId);
                            } catch (err) {}
                        }

                        document.body.classList.add('veyra-img-active');
                        currentState = 'PRESSING';
                        setOverlayVisualState(true);
                    } else {
                        document.body.classList.remove('veyra-img-active');
                        if (overlay && overlay.style.display !== 'none') overlay.style.display = 'none';
                        if (toolbar && toolbar.style.display !== 'none') toolbar.style.display = 'none';
                        if (modeMenu && modeMenu.style.display !== 'none') modeMenu.style.display = 'none';
                        hideDropIndicator();
                        if (activeImg || currentState !== 'IDLE') {
                            activeImg = null;
                            currentState = 'IDLE';
                            sendDragState(false);
                        }
                        if (!window.__veyraIsReadOnly) {
                            setEditorEditable(true);
                        }
                    }
                }
                window.addEventListener('pointerdown', onPointerDownCapture, { capture: true, passive: false });
                document.addEventListener('pointerdown', onPointerDownCapture, { capture: true, passive: false });

                window.addEventListener('pointermove', function(e) {
                    if (window.__veyraIsReadOnly) return;
                    if (currentState === 'PRESSING') {
                        e.preventDefault();
                        e.stopPropagation();
                        const dx = e.clientX - startPointerX;
                        const dy = e.clientY - startPointerY;
                        if (Math.hypot(dx, dy) > 3) {
                            currentState = 'DRAGGING';
                            sendDragState(true);
                            setOverlayVisualState(true);
                            if (toolbar) toolbar.style.display = 'none';
                            if (modeMenu) modeMenu.style.display = 'none';
                            lastWrapContainer = null;
                            lastWrapOffset = -1;
                            lastWrapSide = '';
                            currentPointerX = e.clientX;
                            currentPointerY = e.clientY;
                            updateDragPosition(e.clientX, e.clientY);
                            updateAutoScrollSpeed(e.clientY, e.screenY);
                        }
                        return;
                    }

                    if (currentState === 'DRAGGING' && activeImg) {
                        e.preventDefault();
                        e.stopPropagation();
                        currentPointerX = e.clientX;
                        currentPointerY = e.clientY;

                        updateDragPosition(e.clientX, e.clientY);
                        updateAutoScrollSpeed(e.clientY, e.screenY);
                    }
                }, { passive: false });

                window.addEventListener('pointerup', function(e) {
                    if (window.__veyraIsReadOnly) return;
                    if (overlay && e.pointerId && typeof overlay.releasePointerCapture === 'function') {
                        try {
                            overlay.releasePointerCapture(e.pointerId);
                        } catch (err) {}
                    }
                    if (currentState === 'PRESSING') {
                        currentState = 'SELECTED';
                        setOverlayVisualState(false);
                        setEditorEditable(false);
                        if (activeImg) {
                            activeImg.style.transform = '';
                            updateOverlayPos(activeImg, false);
                        }
                        return;
                    }

                    if (currentState === 'DRAGGING') {
                        stopAutoScrollLoop();
                        hideDropIndicator();
                        currentState = 'SELECTED';
                        setOverlayVisualState(false);
                        sendDragState(false);
                        setEditorEditable(false);

                        if (activeImg) {
                            const curMode = getImageMode(activeImg);
                            const editor = getEditor();
                            const editorRect = editor ? editor.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth };
                            const editorWidth = editorRect.width || (window.innerWidth - 32);

                            if (curMode === 'front' || curMode === 'back') {
                                const dx = e.clientX - startPointerX;
                                const dy = e.clientY - startPointerY;
                                const newLeft = Math.max(8, Math.min(editorWidth - (activeImg.offsetWidth || 100) - 8, imgStartDocLeft + dx));
                                const newTop = Math.max(8, imgStartDocTop + dy);
                                activeImg.style.transform = '';
                                activeImg.style.position = 'absolute';
                                activeImg.style.left = newLeft + 'px';
                                activeImg.style.top = newTop + 'px';
                                activeImg.setAttribute('data-x', newLeft);
                                activeImg.setAttribute('data-y', newTop);
                            } else {
                                // wrap | break | inline: image is already at real-time line position in DOM!
                                activeImg.style.transform = '';
                                if (curMode === 'wrap') {
                                    const side = (e.clientX < (window.innerWidth * 0.5)) ? 'left' : 'right';
                                    applyImageMode(activeImg, 'wrap', side);
                                } else {
                                    applyImageMode(activeImg, curMode);
                                }

                                if (editor) {
                                    try {
                                        editor.normalize();
                                    } catch(e) {}
                                }
                            }

                            ensureEditorHeight();
                            setTimeout(function() {
                                updateOverlayPos(activeImg, false);
                                notifyChange();
                            }, 40);
                        }
                    }
                });

                window.addEventListener('pointercancel', function(e) {
                    if (overlay && e.pointerId && typeof overlay.releasePointerCapture === 'function') {
                        try {
                            overlay.releasePointerCapture(e.pointerId);
                        } catch (err) {}
                    }
                    recoverDrag();
                });

                window.__veyraRefreshTheme = function() {
                    const curAccent = window.__veyraAccentColor || ACCENT_COLOR;
                    const curDark = (window.__veyraIsDark !== undefined) ? window.__veyraIsDark : IS_DARK;
                    setOverlayVisualState(currentState === 'DRAGGING' || currentState === 'PRESSING');
                    if (handle) handle.style.backgroundColor = curAccent;
                    if (toolbar) {
                        toolbar.style.backgroundColor = curDark ? '#1E222D' : '#FFFFFF';
                        toolbar.style.borderColor = curDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';
                        if (activeImg) {
                            updateToolbarState(activeImg);
                        } else {
                            const editBtn = toolbar.querySelector('[data-role="edit"]');
                            if (editBtn) {
                                editBtn.style.background = curDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
                                editBtn.style.color = curDark ? '#F1F5F9' : '#0F172A';
                            }
                        }
                    }
                    if (modeMenu) {
                        modeMenu.style.backgroundColor = curDark ? '#1E222D' : '#FFFFFF';
                        modeMenu.style.borderColor = curDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';
                    }
                    ensureEditorHeight();
                };

                // Sanitizador de pegado
                function cleanPastedHtml(rawHtml) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(rawHtml, 'text/html');
                        const body = doc.body;
                        if (!body) return rawHtml;

                        const unwantedTags = body.querySelectorAll('meta, link, style, script, noscript, title, iframe, object, embed');
                        unwantedTags.forEach(function(el) { el.remove(); });

                        const allNodes = body.querySelectorAll('*');
                        allNodes.forEach(function(el) {
                            if (el.style) {
                                el.style.removeProperty('background');
                                el.style.removeProperty('background-color');
                                el.style.removeProperty('background-image');
                                el.style.removeProperty('color');
                                el.style.removeProperty('font-family');
                                el.style.removeProperty('line-height');
                                if (!el.getAttribute('style') || el.style.length === 0) {
                                    el.removeAttribute('style');
                                }
                            }
                            if (el.id && !el.id.startsWith('veyra-')) el.removeAttribute('id');
                            if (el.className && typeof el.className === 'string' && el.className.indexOf('veyra-') === -1) {
                                el.removeAttribute('class');
                            }
                        });
                        return body.innerHTML;
                    } catch (e) {
                        return rawHtml;
                    }
                }

                function insertCleanHtmlAtCaret(cleanHtml) {
                    let inserted = false;
                    try {
                        inserted = document.execCommand('insertHTML', false, cleanHtml);
                    } catch (e) {
                        inserted = false;
                    }
                    if (!inserted) {
                        const sel = window.getSelection();
                        if (sel && sel.rangeCount > 0) {
                            const range = sel.getRangeAt(0);
                            range.deleteContents();
                            const wrapper = document.createElement('div');
                            wrapper.innerHTML = cleanHtml;
                            const frag = document.createDocumentFragment();
                            let node;
                            let lastNode;
                            while ((node = wrapper.firstChild)) {
                                lastNode = frag.appendChild(node);
                            }
                            range.insertNode(frag);
                            if (lastNode) {
                                const newRange = range.cloneRange();
                                newRange.setStartAfter(lastNode);
                                newRange.collapse(true);
                                sel.removeAllRanges();
                                sel.addRange(newRange);
                            }
                        }
                    }
                }

                if (!window.__veyraPasteListenerInstalled) {
                    window.__veyraPasteListenerInstalled = true;
                    document.addEventListener('paste', function(e) {
                        try {
                            const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData) || window.clipboardData;
                            if (!clipboardData) return;
                            const html = clipboardData.getData('text/html');
                            if (html && html.trim()) {
                                e.preventDefault();
                                e.stopPropagation();
                                const cleanedHtml = cleanPastedHtml(html);
                                insertCleanHtmlAtCaret(cleanedHtml);
                                notifyChange();
                            }
                        } catch (err) {}
                    }, true);
                }

                function sanitizeExistingBadBackgrounds() {
                    try {
                        const editor = getEditor();
                        if (!editor) return;
                        const styledEls = editor.querySelectorAll('[style*="background"], [style*="Background"], [style*="BACKGROUND"]');
                        styledEls.forEach(function(el) {
                            if (el.id && el.id.startsWith('veyra-')) return;
                            if (el.className && typeof el.className === 'string' && el.className.indexOf('veyra-') !== -1) return;
                            const bg = (el.style.backgroundColor || el.style.background || '').toLowerCase();
                            if (bg.includes('255, 255, 255') || bg.includes('#fff') || bg.includes('white') || bg.includes('rgb(255') || bg.includes('#ffffff')) {
                                el.style.removeProperty('background-color');
                                el.style.removeProperty('background');
                                if (!el.getAttribute('style') || el.style.length === 0) {
                                    el.removeAttribute('style');
                                }
                            }
                        });
                    } catch (e) {}
                }

                sanitizeExistingBadBackgrounds();
                enforceAllImages();
                try {
                    var imgObserver = new MutationObserver(function() {
                        enforceAllImages();
                    });
                    var obsTarget = getEditor() || document.body;
                    if (obsTarget) {
                        imgObserver.observe(obsTarget, { childList: true, subtree: true });
                    }
                } catch(e) {}
                ensureEditorHeight();
            })();
            true;
        `;

        try {
            const ref = activeRefHolder.current?.current;
            if (ref) {
                if (typeof ref.injectJavascript === 'function') {
                    ref.injectJavascript(script);
                } else if (typeof ref.injectJavaScript === 'function') {
                    ref.injectJavaScript(script);
                } else if (ref.webviewBridge && typeof ref.webviewBridge.injectJavaScript === 'function') {
                    ref.webviewBridge.injectJavaScript(script);
                }
            }
        } catch (e) {
            console.warn('Error injecting script:', e);
        }
    }, [accentColor, isDark, readOnly]);

    const handleMessage = useCallback((message: any) => {
        try {
            let parsed = message;
            if (typeof message === 'string') {
                try {
                    parsed = JSON.parse(message);
                } catch (e) {}
            }
            if (parsed) {
                if (parsed.type === 'CONTENT_CHANGE' && typeof parsed.data === 'string') {
                    setDescription?.(parsed.data);
                    return;
                }
                if (parsed.type === 'CROP_IMAGE' && parsed.data) {
                    onCropImage?.(parsed.data);
                    return;
                }
                if (parsed.type === 'DISMISS_KEYBOARD') {
                    Keyboard.dismiss();
                    activeRef.current?.dismissKeyboard?.();
                    activeRef.current?.blurContentEditor?.();
                    return;
                }
                if (parsed.type === 'DRAG_START') {
                    Keyboard.dismiss();
                    activeRef.current?.dismissKeyboard?.();
                    activeRef.current?.blurContentEditor?.();
                    onDragStateChange?.(true);
                    return;
                }
                if (parsed.type === 'DRAG_END') {
                    onDragStateChange?.(false);
                    return;
                }
                if (parsed.type === 'AUTO_SCROLL' && typeof parsed.deltaY === 'number') {
                    onAutoScroll?.(parsed.deltaY);
                    return;
                }
                if (parsed.type === 'UNDO') {
                    onUndo?.();
                    return;
                }
                if (parsed.type === 'REDO') {
                    onRedo?.();
                    return;
                }
            }
        } catch (e) {
            console.error('[Veyra Debug Native] Error procesando handleMessage:', e);
        }
    }, [onCropImage, onDragStateChange, onAutoScroll, activeRef, setDescription, onUndo, onRedo]);

    const injectCheckboxHandlerScript = useCallback(() => {
        const ref = activeRefHolder.current?.current;
        if (!ref) return;
        const script = `
            (function() {
                function syncAllCheckboxes() {
                    try {
                        var checkboxes = document.querySelectorAll('.x-todo-box input[type="checkbox"], .x-todo input[type="checkbox"]');
                        checkboxes.forEach(function(cb) {
                            var li = cb.closest('li');
                            if (cb.hasAttribute('checked') || cb.checked) {
                                cb.checked = true;
                                if (!cb.hasAttribute('checked')) cb.setAttribute('checked', 'checked');
                                if (li) li.classList.add('x-todo-checked');
                            } else {
                                cb.checked = false;
                                if (cb.hasAttribute('checked')) cb.removeAttribute('checked');
                                if (li) li.classList.remove('x-todo-checked');
                            }
                        });
                    } catch(e) {}
                }

                function isCheckboxLiEmpty(li) {
                    if (!li) return false;
                    var clone = li.cloneNode(true);
                    var box = clone.querySelector('.x-todo-box');
                    if (box) box.remove();
                    var text = (clone.textContent || '').replace(/[\\u200B-\\u200D\\uFEFF\\s]/g, '');
                    return text === '';
                }

                function getCurrentCheckboxLi() {
                    var sel = window.getSelection();
                    if (!sel || !sel.rangeCount) return null;
                    var node = sel.anchorNode;
                    if (!node) return null;
                    if (node.nodeType === 3) {
                        node = node.parentNode;
                    }
                    if (!node) return null;
                    return node.closest ? node.closest('.x-todo li') : null;
                }

                function setCursorToEnd(node) {
                    try {
                        var selection = window.getSelection();
                        var range = document.createRange();
                        range.selectNodeContents(node);
                        range.collapse(false);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } catch(e) {}
                }

                function exitChecklistFromLi(li) {
                    var ol = li.closest('.x-todo');
                    if (!ol) return;
                    var newDiv = document.createElement('div');
                    newDiv.innerHTML = '<br>';

                    var nextLis = [];
                    var next = li.nextElementSibling;
                    while (next) {
                        nextLis.push(next);
                        next = next.nextElementSibling;
                    }

                    li.remove();

                    if (nextLis.length > 0) {
                        var newOl = document.createElement('ol');
                        newOl.className = 'x-todo';
                        nextLis.forEach(function(n) { newOl.appendChild(n); });
                        ol.parentNode.insertBefore(newDiv, ol.nextSibling);
                        ol.parentNode.insertBefore(newOl, newDiv.nextSibling);
                    } else {
                        if (ol.children.length === 0) {
                            ol.parentNode.replaceChild(newDiv, ol);
                        } else {
                            ol.parentNode.insertBefore(newDiv, ol.nextSibling);
                        }
                    }

                    setCursorToEnd(newDiv);

                    var editor = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor');
                    if (editor) {
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        try {
                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'CONTENT_CHANGE',
                                    data: editor.innerHTML
                                }));
                            }
                        } catch(err) {}
                    }
                }

                function handleBackspaceOnLi(li) {
                    var ol = li.closest('.x-todo');
                    if (!ol) return;
                    var prevLi = li.previousElementSibling;

                    if (prevLi) {
                        li.remove();
                        setCursorToEnd(prevLi);
                    } else {
                        var newDiv = document.createElement('div');
                        newDiv.innerHTML = '<br>';
                        if (ol.children.length <= 1) {
                            ol.parentNode.replaceChild(newDiv, ol);
                        } else {
                            li.remove();
                            ol.parentNode.insertBefore(newDiv, ol);
                        }
                        setCursorToEnd(newDiv);
                    }

                    var editor = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor');
                    if (editor) {
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        try {
                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'CONTENT_CHANGE',
                                    data: editor.innerHTML
                                }));
                            }
                        } catch(err) {}
                    }
                }

                if (!window.__veyraCheckboxHandlerAttached) {
                    window.__veyraCheckboxHandlerAttached = true;
                    var lastExitTime = 0;

                    document.addEventListener('keydown', function(e) {
                        var isZ = e.key === 'z' || e.key === 'Z' || e.keyCode === 90;
                        var isY = e.key === 'y' || e.key === 'Y' || e.keyCode === 89;
                        if (e.ctrlKey || e.metaKey) {
                            if (isZ) {
                                e.preventDefault();
                                e.stopPropagation();
                                try {
                                    if (window.ReactNativeWebView) {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: e.shiftKey ? 'REDO' : 'UNDO'
                                        }));
                                    }
                                } catch(err) {}
                                return;
                            } else if (isY) {
                                e.preventDefault();
                                e.stopPropagation();
                                try {
                                    if (window.ReactNativeWebView) {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'REDO'
                                        }));
                                    }
                                } catch(err) {}
                                return;
                            }
                        }

                        var isEnter = e.key === 'Enter' || e.keyCode === 13;
                        var isBackspace = e.key === 'Backspace' || e.keyCode === 8;

                        if (isEnter || isBackspace) {
                            var li = getCurrentCheckboxLi();
                            if (li && isCheckboxLiEmpty(li)) {
                                if (isEnter) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    lastExitTime = Date.now();
                                    exitChecklistFromLi(li);
                                } else if (isBackspace) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    lastExitTime = Date.now();
                                    handleBackspaceOnLi(li);
                                }
                            }
                        }
                    }, true);

                    document.addEventListener('beforeinput', function(e) {
                        if (Date.now() - lastExitTime < 100) {
                            e.preventDefault();
                            return;
                        }
                        var isEnter = e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak';
                        var isBackspace = e.inputType === 'deleteContentBackward';

                        if (isEnter || isBackspace) {
                            var li = getCurrentCheckboxLi();
                            if (li && isCheckboxLiEmpty(li)) {
                                if (isEnter) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    lastExitTime = Date.now();
                                    exitChecklistFromLi(li);
                                } else if (isBackspace) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    lastExitTime = Date.now();
                                    handleBackspaceOnLi(li);
                                }
                            }
                        }
                    }, true);

                    document.addEventListener('change', function(e) {
                        var target = e.target;
                        if (target && target.type === 'checkbox' && (target.closest('.x-todo-box') || target.closest('.x-todo'))) {
                            var li = target.closest('li');
                            if (target.checked) {
                                target.setAttribute('checked', 'checked');
                                if (li) li.classList.add('x-todo-checked');
                            } else {
                                target.removeAttribute('checked');
                                if (li) li.classList.remove('x-todo-checked');
                            }

                            var editor = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor');
                            if (editor) {
                                editor.dispatchEvent(new Event('input', { bubbles: true }));
                                try {
                                    if (window.ReactNativeWebView) {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'CONTENT_CHANGE',
                                            data: editor.innerHTML
                                        }));
                                    }
                                } catch(err) {}
                            }
                        }
                    }, true);

                    try {
                        var observer = new MutationObserver(function() {
                            syncAllCheckboxes();
                        });
                        var root = document.querySelector('.pell-content') || document.getElementById('content') || document.body;
                        if (root) {
                            observer.observe(root, { childList: true, subtree: true });
                        }
                    } catch(e) {}
                }

                syncAllCheckboxes();
            })();
            true;
        `;
        try {
            const ref = activeRefHolder.current?.current;
            ref?.injectJavascript?.(script);
            ref?.injectJavaScript?.(script);
            ref?.webviewBridge?.injectJavaScript?.(script);
        } catch (e) {}
    }, []);

    // onLink no se usa para crop (window.location.href en Pell va a Linking.openURL, no a onLink)
    const handleLink = useCallback((_url: string) => {
        // No-op: el crop usa postMessage, no URL scheme
    }, []);

    useEffect(() => {
        const t1 = setTimeout(() => {
            injectImageHandlerScript();
            injectCheckboxHandlerScript();
        }, 300);
        return () => clearTimeout(t1);
    }, [injectImageHandlerScript, injectCheckboxHandlerScript]);

    useEffect(() => {
        const script = `
            (function() {
                var el = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor') || document.body;
                if (el) {
                    el.setAttribute('contenteditable', '${readOnly ? 'false' : 'true'}');
                    el.style.cursor = '${readOnly ? 'default' : 'text'}';
                    document.body.style.cursor = '${readOnly ? 'default' : 'text'}';
                    if (${readOnly ? 'true' : 'false'}) {
                        el.blur();
                    }
                }
                if (${readOnly ? 'true' : 'false'}) {
                    var ids = ['veyra-img-overlay', 'veyra-img-toolbar', 'veyra-img-mode-menu', 'veyra-drop-indicator'];
                    ids.forEach(function(id) {
                        var node = document.getElementById(id);
                        if (node) node.remove();
                    });
                }
                window.__veyraIsReadOnly = ${readOnly ? 'true' : 'false'};
            })();
            true;
        `;
        try {
            const ref = activeRefHolder.current?.current;
            ref?.injectJavascript?.(script);
            ref?.injectJavaScript?.(script);
            ref?.webviewBridge?.injectJavaScript?.(script);
        } catch (e) {}
        injectImageHandlerScript();
        injectCheckboxHandlerScript();
    }, [readOnly, injectImageHandlerScript, injectCheckboxHandlerScript]);

    return (
        <View style={flat ? styles.flatContainer : styles.container}>
            {!flat && !readOnly && (
                <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                    {t('create.sections.notes').toUpperCase()}
                </Text>
            )}

            <VeyraSurface
                level={flat ? 0 : 1}
                radius="md"
                bordered={!flat && !readOnly}
                style={[
                    styles.editorWrapper,
                    flat
                        ? { backgroundColor: 'transparent', borderWidth: 0, minHeight: calculatedMinHeight, flex: 1 }
                        : { minHeight: readOnly ? 60 : 68 },
                ]}
            >
                <RichEditor
                    ref={activeRef}
                    initialContentHTML={description}
                    onChange={setDescription || (() => {})}
                    onMessage={handleMessage}
                    onLink={handleLink}
                    disabled={readOnly}
                    onFocus={() => {
                        if (!readOnly) {
                            onFocus?.();
                        }
                    }}
                    onBlur={onBlur}
                    onCursorPosition={onCursorPosition}
                    placeholder={readOnly ? '' : t('create.placeholder_notes')}
                    scrollEnabled={false}
                    initialHeight={flat ? calculatedMinHeight : (readOnly ? 100 : calculatedMinHeight)}
                    style={{ flex: 1, minHeight: flat ? calculatedMinHeight : (readOnly ? 60 : calculatedMinHeight) }}
                    autoCapitalize="sentences"
                    autoCorrect={true}
                    editorInitializedCallback={() => {
                        // Neutralizar el TextInput fantasma de Pell Rich Editor en Android para evitar saltos erráticos a bottom: -999
                        if (Platform.OS === 'android' && activeRefHolder.current?.current?._input) {
                            try {
                                activeRefHolder.current.current._input.setNativeProps?.({
                                    style: { position: 'absolute', top: 0, left: 0, width: 0, height: 0, opacity: 0 },
                                });
                            } catch {}
                        }
                        injectImageHandlerScript();
                        injectCheckboxHandlerScript();
                    }}
                    editorStyle={{
                        backgroundColor: flat ? 'transparent' : colors.surface,
                        color: colors.textPrimary,
                        placeholderColor: colors.textMuted,
                        contentCSSText: `
                            font-size: ${flat ? '16px' : '14.5px'}; 
                            line-height: ${flat ? '24px' : '20px'}; 
                            padding: ${readOnly ? '4px 0px 16px 0px' : (flat ? '8px 0px 48px 0px' : '10px 12px')};
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                            min-height: ${flat ? `${calculatedMinHeight}px` : (readOnly ? 'auto' : `${calculatedMinHeight}px`)};
                            box-sizing: border-box;
                        `,
                        cssText: `
                            html, body {
                                min-height: 100% !important;
                                height: 100% !important;
                                margin: 0;
                                padding: 0;
                                overflow-x: hidden !important;
                                overflow-y: hidden !important;
                                cursor: ${readOnly ? 'default' : 'text'} !important;
                                display: flex;
                                flex-direction: column;
                                flex: 1 !important;
                                -webkit-user-select: ${readOnly ? 'none' : 'text'};
                                user-select: ${readOnly ? 'none' : 'text'};
                                -webkit-touch-callout: ${readOnly ? 'none' : 'default'};
                            }
                            #editor, .pell-content {
                                flex: 1 !important;
                                min-height: ${flat ? `${calculatedMinHeight}px` : (readOnly ? 'auto' : `${calculatedMinHeight}px`)} !important;
                                cursor: ${readOnly ? 'default' : 'text'} !important;
                                outline: none !important;
                                display: block !important;
                                position: relative !important;
                                padding-bottom: ${readOnly ? '24px' : '250px'} !important;
                                -webkit-user-select: ${readOnly ? 'none' : 'text'} !important;
                                user-select: ${readOnly ? 'none' : 'text'} !important;
                                -webkit-touch-callout: ${readOnly ? 'none' : 'default'} !important;
                            }
                            #editor > *, .pell-content > * {
                                display: block;
                            }
                            /* Base fallback sin modo */
                            img:not([data-mode]) {
                                border-radius: 10px;
                                cursor: pointer !important;
                                pointer-events: auto !important;
                                -webkit-user-drag: none !important;
                                user-drag: none !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                -webkit-touch-callout: none !important;
                                -webkit-tap-highlight-color: transparent !important;
                                box-sizing: border-box;
                                vertical-align: middle;
                                display: block !important;
                                clear: both !important;
                                float: none !important;
                                margin: 14px auto !important;
                                max-width: 100% !important;
                                height: auto !important;
                                touch-action: none !important;
                            }
                            /* Mode: wrap (Ajustar texto - Flotante a la izquierda) */
                            img[data-mode="wrap"][data-side="left"],
                            img[data-mode="wrap-left"] {
                                border-radius: 10px;
                                cursor: pointer !important;
                                pointer-events: auto !important;
                                -webkit-user-drag: none !important;
                                user-drag: none !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                -webkit-touch-callout: none !important;
                                -webkit-tap-highlight-color: transparent !important;
                                box-sizing: border-box;
                                vertical-align: top;
                                display: block !important;
                                clear: left !important;
                                float: left !important;
                                margin: 6px 16px 10px 0 !important;
                                max-width: 65% !important;
                                height: auto !important;
                                touch-action: none !important;
                            }
                            /* Mode: wrap (Ajustar texto - Flotante a la derecha) */
                            img[data-mode="wrap"][data-side="right"],
                            img[data-mode="wrap-right"] {
                                border-radius: 10px;
                                cursor: pointer !important;
                                pointer-events: auto !important;
                                -webkit-user-drag: none !important;
                                user-drag: none !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                -webkit-touch-callout: none !important;
                                -webkit-tap-highlight-color: transparent !important;
                                box-sizing: border-box;
                                vertical-align: top;
                                display: block !important;
                                clear: right !important;
                                float: right !important;
                                margin: 6px 0 10px 16px !important;
                                max-width: 65% !important;
                                height: auto !important;
                                touch-action: none !important;
                            }
                            /* Mode: wrap por defecto sin lado especificado */
                            img[data-mode="wrap"]:not([data-side]) {
                                border-radius: 10px;
                                cursor: pointer !important;
                                pointer-events: auto !important;
                                display: block !important;
                                clear: left !important;
                                float: left !important;
                                margin: 6px 16px 10px 0 !important;
                                max-width: 65% !important;
                                height: auto !important;
                                touch-action: none !important;
                            }
                            /* Mode: front (Delante del texto - Posicion libre absoluta) */
                            img[data-mode="front"],
                            img[data-mode="free"] {
                                border-radius: 10px;
                                cursor: pointer !important;
                                pointer-events: auto !important;
                                -webkit-user-drag: none !important;
                                user-drag: none !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                -webkit-touch-callout: none !important;
                                -webkit-tap-highlight-color: transparent !important;
                                box-sizing: border-box;
                                display: block !important;
                                height: auto !important;
                                touch-action: none !important;
                                position: absolute !important;
                                z-index: 20 !important;
                                margin: 0 !important;
                                float: none !important;
                                clear: none !important;
                                box-shadow: 0 4px 14px rgba(0,0,0,0.15) !important;
                            }
                            /* Mode: back (Detrás del texto - Fondo / Marca de agua) */
                            img[data-mode="back"] {
                                border-radius: 10px;
                                cursor: pointer !important;
                                pointer-events: auto !important;
                                -webkit-user-drag: none !important;
                                user-drag: none !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                -webkit-touch-callout: none !important;
                                -webkit-tap-highlight-color: transparent !important;
                                box-sizing: border-box;
                                display: block !important;
                                height: auto !important;
                                touch-action: none !important;
                                position: absolute !important;
                                z-index: 1 !important;
                                margin: 0 !important;
                                float: none !important;
                                clear: none !important;
                                opacity: 0.85 !important;
                            }
                            /* Mode: break (Dividir texto) y fallback para inline */
                            img[data-mode="break"],
                            img[data-mode="inline"] {
                                border-radius: 10px;
                                cursor: pointer !important;
                                pointer-events: auto !important;
                                -webkit-user-drag: none !important;
                                user-drag: none !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                -webkit-touch-callout: none !important;
                                -webkit-tap-highlight-color: transparent !important;
                                box-sizing: border-box;
                                display: block !important;
                                clear: both !important;
                                float: none !important;
                                margin: 16px auto !important;
                                max-width: 100% !important;
                                height: auto !important;
                                touch-action: none !important;
                            }
                            #veyra-img-overlay {
                                pointer-events: auto !important;
                                touch-action: none !important;
                                cursor: move !important;
                                -webkit-user-drag: none !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                -webkit-touch-callout: none !important;
                            }
                            #veyra-img-handle {
                                pointer-events: auto !important;
                                touch-action: none !important;
                                -webkit-user-drag: none !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                            }
                            #editor img, .pell-content img, body img {
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                -webkit-touch-callout: none !important;
                                -webkit-user-drag: none !important;
                                user-drag: none !important;
                                touch-action: none !important;
                            }
                            #veyra-img-toolbar,
                            #veyra-img-mode-menu {
                                pointer-events: auto !important;
                                touch-action: pan-x !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                                box-sizing: border-box !important;
                            }
                            #veyra-img-toolbar button {
                                flex-shrink: 0 !important;
                                touch-action: manipulation !important;
                                -webkit-user-select: none !important;
                                user-select: none !important;
                            }
                            #veyra-drop-indicator {
                                display: none !important;
                                pointer-events: none !important;
                                touch-action: none !important;
                                box-sizing: border-box !important;
                            }
                            body.veyra-img-active,
                            body.veyra-img-active *,
                            body.veyra-dragging-active,
                            body.veyra-dragging-active * {
                                touch-action: none !important;
                                user-select: none !important;
                                -webkit-user-select: none !important;
                                -webkit-touch-callout: none !important;
                            }
                            .img-align-left {
                                display: block !important;
                                clear: both !important;
                                float: none !important;
                                margin: 14px auto 14px 0 !important;
                            }
                            .img-align-center {
                                display: block !important;
                                clear: both !important;
                                float: none !important;
                                margin: 14px auto !important;
                            }
                            .img-align-right {
                                display: block !important;
                                clear: both !important;
                                float: none !important;
                                margin: 14px 0 14px auto !important;
                            }
                            #veyra-img-overlay,
                            #veyra-img-handle,
                            #veyra-img-toolbar,
                            #veyra-img-toolbar button {
                                box-shadow: none !important;
                                -webkit-box-shadow: none !important;
                                filter: none !important;
                                -webkit-filter: none !important;
                            }
                            /* ==================== VEYRA TASK CHECKLISTS (.x-todo) ==================== */
                            .x-todo {
                                list-style: none !important;
                                padding-left: 0 !important;
                                margin: 8px 0 !important;
                            }
                            .x-todo li {
                                list-style: none !important;
                                position: relative !important;
                                padding-left: 28px !important;
                                margin: 6px 0 !important;
                                min-height: 24px !important;
                                line-height: 1.5 !important;
                                transition: color 0.2s ease, opacity 0.2s ease;
                            }
                            .x-todo-box {
                                position: absolute !important;
                                left: 0 !important;
                                top: 2px !important;
                                width: 22px !important;
                                height: 22px !important;
                                display: inline-flex !important;
                                align-items: center !important;
                                justify-content: center !important;
                                user-select: none !important;
                                -webkit-user-select: none !important;
                                pointer-events: auto !important;
                                cursor: pointer !important;
                            }
                            .x-todo-box input[type="checkbox"] {
                                position: relative !important;
                                appearance: none !important;
                                -webkit-appearance: none !important;
                                width: 18px !important;
                                height: 18px !important;
                                border: 1.8px solid ${isDark ? '#52525B' : '#CBD5E1'} !important;
                                border-radius: 5px !important;
                                outline: none !important;
                                background-color: ${isDark ? '#27272A' : '#F8FAFC'} !important;
                                cursor: pointer !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                pointer-events: auto !important;
                                vertical-align: middle !important;
                                transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
                                box-sizing: border-box !important;
                                display: block !important;
                            }
                            .x-todo-box input[type="checkbox"]:checked {
                                background-color: ${accentColor} !important;
                                border-color: ${accentColor} !important;
                            }
                            .x-todo-box input[type="checkbox"]:checked::after {
                                content: '' !important;
                                position: absolute !important;
                                left: 5px !important;
                                top: 1.5px !important;
                                width: 5px !important;
                                height: 9px !important;
                                border: solid #FFFFFF !important;
                                border-width: 0 2px 2px 0 !important;
                                transform: rotate(45deg) !important;
                                box-sizing: border-box !important;
                                display: block !important;
                            }
                            .x-todo-box input[type="checkbox"]:active {
                                transform: scale(0.9) !important;
                            }
                            .x-todo li:has(input[type="checkbox"]:checked),
                            .x-todo li.x-todo-checked {
                                color: ${isDark ? '#71717A' : '#94A3B8'} !important;
                                text-decoration: line-through !important;
                            }
                        `,
                    }}
                />
            </VeyraSurface>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        gap: 8,
        marginBottom: 16,
    },
    flatContainer: {
        width: '100%',
        flex: 1,
    },
    sectionTitle: {
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 2,
    },
    editorWrapper: {
        width: '100%',
        overflow: 'hidden',
    },
});
