import React, { useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RichEditor } from 'react-native-pell-rich-editor';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { getFontFamilyCss, GOOGLE_FONTS_CSS_IMPORT, NOTE_FONTS_OVERRIDE_CSS, NOTE_FONTS } from '../../constants/noteFonts';

interface RichTextEditorSectionProps {
    description: string;
    setDescription?: (desc: string) => void;
    editorRef?: any;
    onFocus?: () => void;
    onBlur?: () => void;
    flat?: boolean;
    isDark?: boolean;
    readOnly?: boolean;
    fontFamily?: string;
    onCropImage?: (imageUri: string) => void;
    onDragStateChange?: (isDragging: boolean) => void;
    onAutoScroll?: (deltaY: number) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onCursorPosition?: (offsetY: number) => void;
    onCursorActivity?: (cursor: {
        blockIndex?: number;
        charOffset?: number;
        globalCharOffset?: number;
        top: number;
        left: number;
        height: number;
        collapsed: boolean;
    }) => void;
    onCursorRemove?: () => void;
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
    fontFamily = 'sans',
    onCropImage,
    onDragStateChange,
    onAutoScroll,
    onUndo,
    onRedo,
    onCursorPosition,
    onCursorActivity,
    onCursorRemove,
}: RichTextEditorSectionProps) {
    const { t } = useTranslation();
    const { colors, typography, radii, isDark, accent } = useVeyraTheme();
    const screenHeight = Dimensions.get('screen').height;
    const calculatedMinHeight = flat ? Math.max(560, screenHeight - 140) : 68;
    const accentColor = accent.primary || '#8B5CF6';
    const activeFontCss = getFontFamilyCss(fontFamily);
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
                    if (window.__veyraIsApplyingRemote) return;
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
                if (parsed.type === 'CURSOR_ACTIVITY' && parsed.cursor) {
                    onCursorActivity?.(parsed.cursor);
                    return;
                }
                if (parsed.type === 'CURSOR_REMOVE') {
                    onCursorRemove?.();
                    return;
                }
            }
        } catch (e) {
            console.error('[Veyra Debug Native] Error procesando handleMessage:', e);
        }
    }, [onCropImage, onDragStateChange, onAutoScroll, activeRef, setDescription, onUndo, onRedo, onCursorActivity, onCursorRemove]);

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

    const injectCollabHandlerScript = useCallback(() => {
        const ref = activeRefHolder.current?.current;
        if (!ref) return;
        const script = `
            (function() {
                var SCRIPT_VER = 'v2.0';
                var editor = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor') || document.body;
                if (!editor) return;

                // 1. Interceptar postMessage para neutralizar ecos automáticos al reconciliar DOM remoto
                if (window.ReactNativeWebView && !window.__veyraMsgInterceptionActive) {
                    window.__veyraMsgInterceptionActive = true;
                    var _origPost = window.ReactNativeWebView.postMessage.bind(window.ReactNativeWebView);
                    window.ReactNativeWebView.postMessage = function(data) {
                        if (window.__veyraIsApplyingRemote) {
                            try {
                                var p = (typeof data === 'string') ? JSON.parse(data) : data;
                                if (p && (p.type === 'CONTENT_CHANGE' || p.type === 'onChange')) {
                                    return; // Suprimir eco provocado por actualización remota
                                }
                            } catch(err) {}
                        }
                        return _origPost(data);
                    };
                }

                // 2. Estilos para cursores remotos (estilo Google Docs / Figma)
                if (!document.getElementById('veyra-collab-styles')) {
                    var styleEl = document.createElement('style');
                    styleEl.id = 'veyra-collab-styles';
                    styleEl.textContent = \`
                        @keyframes veyraCursorPulse {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.5; }
                        }
                        .veyra-remote-cursor {
                            animation: veyraCursorPulse 1.4s infinite ease-in-out;
                        }
                        .veyra-cursor-flag {
                            pointer-events: none;
                            user-select: none;
                            -webkit-user-select: none;
                        }
                    \`;
                    document.head.appendChild(styleEl);
                }

                // Contenedor de cursores remotos en el body
                var cursorContainer = document.getElementById('veyra-remote-cursors');
                if (!cursorContainer) {
                    cursorContainer = document.createElement('div');
                    cursorContainer.id = 'veyra-remote-cursors';
                    cursorContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9990;overflow:visible;';
                    document.body.appendChild(cursorContainer);
                }

                var cursorTimers = window.__veyraCursorTimers || {};
                window.__veyraCursorTimers = cursorTimers;
                var remoteCursorsMap = window.__veyraRemoteCursors || {};
                window.__veyraRemoteCursors = remoteCursorsMap;

                // 3. Helpers de DOM, nodos de texto y medición ultra-precisa de caret
                function findTextNodes(node) {
                    var nodes = [];
                    if (!node) return nodes;
                    if (node.nodeType === 3) {
                        nodes.push(node);
                    } else {
                        for (var i = 0; i < node.childNodes.length; i++) {
                            nodes = nodes.concat(findTextNodes(node.childNodes[i]));
                        }
                    }
                    return nodes;
                }

                function getCoordsFromRange(range) {
                    if (!range) return null;
                    try {
                        // 1. Si el range está en un nodo de texto con caracteres, medir usando selección de 1 caracter para obtener coordenadas EXACTAS
                        if (range.startContainer && range.startContainer.nodeType === 3) {
                            var textNode = range.startContainer;
                            var offset = range.startOffset;
                            var nodeLen = textNode.nodeValue ? textNode.nodeValue.length : 0;
                            if (nodeLen > 0) {
                                var dummyRange = document.createRange();
                                if (offset < nodeLen) {
                                    dummyRange.setStart(textNode, offset);
                                    dummyRange.setEnd(textNode, offset + 1);
                                    var rects = dummyRange.getClientRects();
                                    var r = (rects && rects.length > 0) ? rects[0] : dummyRange.getBoundingClientRect();
                                    if (r && r.height > 0) {
                                        return {
                                            top: Math.round(r.top + window.pageYOffset),
                                            left: Math.round(r.left + window.pageXOffset),
                                            height: Math.round(r.height || 22)
                                        };
                                    }
                                } else if (offset > 0) {
                                    dummyRange.setStart(textNode, offset - 1);
                                    dummyRange.setEnd(textNode, offset);
                                    var rects = dummyRange.getClientRects();
                                    var r = (rects && rects.length > 0) ? rects[0] : dummyRange.getBoundingClientRect();
                                    if (r && r.height > 0) {
                                        return {
                                            top: Math.round(r.top + window.pageYOffset),
                                            left: Math.round(r.right + window.pageXOffset),
                                            height: Math.round(r.height || 22)
                                        };
                                    }
                                }
                            }
                        }

                        // 2. Rectángulos de cliente estándar (si el browser los soporta en collapsed range)
                        var rects = range.getClientRects();
                        if (rects && rects.length > 0 && rects[0].height > 0) {
                            var r = rects[0];
                            return {
                                top: Math.round(r.top + window.pageYOffset),
                                left: Math.round(r.left + window.pageXOffset),
                                height: Math.round(r.height || 22)
                            };
                        }

                        // 3. Medición universal con marcador temporal no destructivo para líneas vacías, <br> o saltos de línea
                        var marker = document.createElement('span');
                        marker.textContent = '\uFEFF';
                        marker.style.cssText = 'display:inline-block;width:1px;height:1em;padding:0;margin:0;border:0;line-height:inherit;font-size:inherit;';
                        var clone = range.cloneRange();
                        clone.collapse(true);
                        clone.insertNode(marker);
                        var mRect = marker.getBoundingClientRect();
                        var markerRes = null;
                        if (mRect && (mRect.top > 0 || mRect.height > 0)) {
                            markerRes = {
                                top: Math.round(mRect.top + window.pageYOffset),
                                left: Math.round(mRect.left + window.pageXOffset),
                                height: Math.round(Math.max(18, Math.min(mRect.height || 22, 32)))
                            };
                        }
                        if (marker.parentNode) {
                            var markerParent = marker.parentNode;
                            markerParent.removeChild(marker);
                            markerParent.normalize();
                        }
                        if (markerRes) return markerRes;

                        // 4. BoundingClientRect directo
                        var bRect = range.getBoundingClientRect();
                        if (bRect && (bRect.height > 0 || bRect.width > 0)) {
                            return {
                                top: Math.round(bRect.top + window.pageYOffset),
                                left: Math.round(bRect.left + window.pageXOffset),
                                height: Math.round(bRect.height || 22)
                            };
                        }

                        // 5. Fallback con elemento contenedor más cercano
                        var elem = range.startContainer;
                        while (elem && elem.nodeType !== 1 && elem !== editor && elem !== document.body) {
                            elem = elem.parentNode;
                        }
                        if (elem && elem !== document.body) {
                            var eRect = elem.getBoundingClientRect();
                            if (eRect && (eRect.height > 0 || eRect.top > 0)) {
                                return {
                                    top: Math.round(eRect.top + window.pageYOffset),
                                    left: Math.round(eRect.left + 8 + window.pageXOffset),
                                    height: Math.round(Math.min(eRect.height || 22, 28))
                                };
                            }
                        }
                    } catch(e) {}
                    return null;
                }

                function getCaretOffset(element) {
                    var caretOffset = 0;
                    try {
                        var sel = window.getSelection();
                        if (sel && sel.rangeCount > 0) {
                            var range = sel.getRangeAt(0);
                            var preCaretRange = range.cloneRange();
                            preCaretRange.selectNodeContents(element);
                            preCaretRange.setEnd(range.endContainer, range.endOffset);
                            caretOffset = preCaretRange.toString().length;
                        }
                    } catch(e) {}
                    return caretOffset;
                }

                function setCaretOffset(element, offset) {
                    try {
                        var textNodes = findTextNodes(element);
                        var currentOffset = 0;
                        var targetNode = null;
                        var targetOffset = 0;

                        for (var i = 0; i < textNodes.length; i++) {
                            var node = textNodes[i];
                            var len = node.nodeValue ? node.nodeValue.length : 0;
                            if (currentOffset + len >= offset) {
                                targetNode = node;
                                targetOffset = offset - currentOffset;
                                break;
                            }
                            currentOffset += len;
                        }

                        if (!targetNode && textNodes.length > 0) {
                            targetNode = textNodes[textNodes.length - 1];
                            targetOffset = targetNode.nodeValue ? targetNode.nodeValue.length : 0;
                        }

                        var sel = window.getSelection();
                        var range = document.createRange();

                        if (targetNode) {
                            range.setStart(targetNode, Math.min(targetOffset, targetNode.nodeValue ? targetNode.nodeValue.length : 0));
                            range.collapse(true);
                        } else {
                            range.selectNodeContents(element);
                            range.collapse(true);
                        }

                        sel.removeAllRanges();
                        sel.addRange(range);
                    } catch(e) {}
                }

                function getCoordsFromBlock(blockIndex, charOffset) {
                    try {
                        if (!editor || !editor.childNodes || editor.childNodes.length === 0) return null;
                        // NUNCA clampear a bloques anteriores si el bloque no existe aún en este cliente
                        if (blockIndex < 0 || blockIndex >= editor.childNodes.length) return null;
                        var targetBlock = editor.childNodes[blockIndex];
                        if (!targetBlock) return null;

                        var textNodes = findTextNodes(targetBlock);
                        if (textNodes.length === 0) {
                            var blockRect = targetBlock.getBoundingClientRect();
                            if (blockRect && (blockRect.top > 0 || blockRect.left > 0)) {
                                return {
                                    top: Math.round(blockRect.top + window.pageYOffset),
                                    left: Math.round(blockRect.left + window.pageXOffset),
                                    height: Math.round(Math.min(blockRect.height || 22, 28))
                                };
                            }
                            return null;
                        }

                        var cur = 0;
                        var targetNode = null;
                        var targetOffset = 0;

                        for (var i = 0; i < textNodes.length; i++) {
                            var tn = textNodes[i];
                            var len = tn.nodeValue ? tn.nodeValue.length : 0;
                            if (cur + len >= charOffset) {
                                targetNode = tn;
                                targetOffset = charOffset - cur;
                                break;
                            }
                            cur += len;
                        }

                        if (!targetNode && textNodes.length > 0) {
                            targetNode = textNodes[textNodes.length - 1];
                            targetOffset = targetNode.nodeValue ? targetNode.nodeValue.length : 0;
                        }

                        if (targetNode) {
                            var nodeLen = targetNode.nodeValue ? targetNode.nodeValue.length : 0;
                            var clamped = Math.min(Math.max(0, targetOffset), nodeLen);
                            var r = document.createRange();

                            if (clamped < nodeLen) {
                                r.setStart(targetNode, clamped);
                                r.setEnd(targetNode, clamped + 1);
                                var rects = r.getClientRects();
                                var rect = (rects && rects.length > 0) ? rects[0] : r.getBoundingClientRect();
                                if (rect && rect.height > 0) {
                                    return {
                                        top: Math.round(rect.top + window.pageYOffset),
                                        left: Math.round(rect.left + window.pageXOffset),
                                        height: Math.round(rect.height || 22)
                                    };
                                }
                            } else if (clamped > 0) {
                                r.setStart(targetNode, clamped - 1);
                                r.setEnd(targetNode, clamped);
                                var rects = r.getClientRects();
                                var rect = (rects && rects.length > 0) ? rects[0] : r.getBoundingClientRect();
                                if (rect && rect.height > 0) {
                                    return {
                                        top: Math.round(rect.top + window.pageYOffset),
                                        left: Math.round(rect.right + window.pageXOffset),
                                        height: Math.round(rect.height || 22)
                                    };
                                }
                            }

                            r.setStart(targetNode, clamped);
                            r.collapse(true);
                            return getCoordsFromRange(r);
                        }
                    } catch(err) {}
                    return null;
                }

                function getCoordsFromGlobalOffset(globalOffset) {
                    try {
                        if (!editor) return null;
                        var textNodes = findTextNodes(editor);
                        if (textNodes.length === 0) return null;

                        var cur = 0;
                        var targetNode = null;
                        var targetOffset = 0;

                        for (var i = 0; i < textNodes.length; i++) {
                            var tn = textNodes[i];
                            var len = tn.nodeValue ? tn.nodeValue.length : 0;
                            if (cur + len >= globalOffset) {
                                targetNode = tn;
                                targetOffset = globalOffset - cur;
                                break;
                            }
                            cur += len;
                        }

                        // Si el offset global está más allá de todo el texto disponible en este cliente, no clampear a la primera línea
                        if (!targetNode) return null;

                        var nodeLen = targetNode.nodeValue ? targetNode.nodeValue.length : 0;
                        var clamped = Math.min(Math.max(0, targetOffset), nodeLen);
                        var r = document.createRange();

                        if (clamped < nodeLen) {
                            r.setStart(targetNode, clamped);
                            r.setEnd(targetNode, clamped + 1);
                            var rects = r.getClientRects();
                            var rect = (rects && rects.length > 0) ? rects[0] : r.getBoundingClientRect();
                            if (rect && rect.height > 0) {
                                return {
                                    top: Math.round(rect.top + window.pageYOffset),
                                    left: Math.round(rect.left + window.pageXOffset),
                                    height: Math.round(rect.height || 22)
                                };
                            }
                        } else if (clamped > 0) {
                            r.setStart(targetNode, clamped - 1);
                            r.setEnd(targetNode, clamped);
                            var rects = r.getClientRects();
                            var rect = (rects && rects.length > 0) ? rects[0] : r.getBoundingClientRect();
                            if (rect && rect.height > 0) {
                                return {
                                    top: Math.round(rect.top + window.pageYOffset),
                                    left: Math.round(rect.right + window.pageXOffset),
                                    height: Math.round(rect.height || 22)
                                };
                            }
                        }

                        r.setStart(targetNode, clamped);
                        r.collapse(true);
                        return getCoordsFromRange(r);
                    } catch(err) {}
                    return null;
                }

                function getCaretCoordinates() {
                    var sel = window.getSelection();
                    if (!sel || sel.rangeCount === 0) return null;
                    var range = sel.getRangeAt(0);
                    var coords = getCoordsFromRange(range);
                    if (coords) return coords;

                    // Fallback con elemento contenedor
                    var node = range.startContainer;
                    var el = (node && node.nodeType === 1) ? node : (node ? node.parentElement : null);
                    if (el && el !== document.body) {
                        var elRect = el.getBoundingClientRect();
                        return {
                            top: Math.round(elRect.top + window.pageYOffset),
                            left: Math.round(elRect.left + window.pageXOffset),
                            height: Math.round(Math.min(elRect.height || 22, 28))
                        };
                    }
                    return null;
                }

                // 4. Renderizado adaptativo de cursores remotos (prioridad directa a coordenadas transmitidas por el emisor)
                function renderRemoteCursor(data) {
                    try {
                        if (!data || !data.clientId || !data.cursor) return;
                        var container = document.getElementById('veyra-remote-cursors');
                        if (!container) return;

                        var id = 'veyra-cursor-' + data.clientId;
                        var cursorEl = document.getElementById(id);

                        if (!cursorEl) {
                            cursorEl = document.createElement('div');
                            cursorEl.id = id;
                            cursorEl.className = 'veyra-remote-cursor';
                            cursorEl.style.cssText = 'position:absolute;width:2.5px;border-radius:1.5px;pointer-events:none;transition:top 0.08s ease-out, left 0.08s ease-out, opacity 0.25s ease;z-index:9992;opacity:1;';

                            var flag = document.createElement('div');
                            flag.className = 'veyra-cursor-flag';
                            flag.style.cssText = 'position:absolute;bottom:100%;left:-2px;margin-bottom:2px;padding:2px 6px;border-radius:4px;font-size:10px;font-family:-apple-system,BlinkMacSystemFont,Roboto,sans-serif;font-weight:700;color:#ffffff;white-space:nowrap;box-shadow:0 1.5px 5px rgba(0,0,0,0.35);line-height:1.2;';
                            cursorEl.appendChild(flag);
                            container.appendChild(cursorEl);
                        }

                        var col = data.color || '#8B5CF6';
                        cursorEl.style.backgroundColor = col;

                        // Las coordenadas transmitidas por el emisor son la fuente de verdad directa del cursor.
                        // Solo usar resolución semántica local si el emisor no transmitió top > 0 o para afinar la columna si está en la misma línea.
                        var sentTop = (typeof data.cursor.top === 'number' && data.cursor.top > 0) ? data.cursor.top : null;
                        var sentLeft = (typeof data.cursor.left === 'number') ? data.cursor.left : null;
                        var sentHeight = (typeof data.cursor.height === 'number' && data.cursor.height > 0) ? data.cursor.height : 22;

                        var localCoords = null;
                        if (typeof data.cursor.blockIndex === 'number' && typeof data.cursor.charOffset === 'number') {
                            localCoords = getCoordsFromBlock(data.cursor.blockIndex, data.cursor.charOffset);
                        }
                        if (!localCoords && typeof data.cursor.globalCharOffset === 'number') {
                            localCoords = getCoordsFromGlobalOffset(data.cursor.globalCharOffset);
                        }

                        var finalTop = sentTop !== null ? sentTop : (localCoords ? localCoords.top : 0);
                        var finalLeft = sentLeft !== null ? sentLeft : (localCoords ? localCoords.left : 0);
                        var finalHeight = sentHeight;

                        // Si la resolución local confirma exactamente la misma línea vertical, afinar posición horizontal
                        if (localCoords && sentTop !== null && Math.abs(localCoords.top - sentTop) <= 15) {
                            finalLeft = localCoords.left;
                        }

                        cursorEl.style.height = finalHeight + 'px';
                        cursorEl.style.top = finalTop + 'px';
                        cursorEl.style.left = finalLeft + 'px';
                        cursorEl.style.opacity = '1';

                        var flagEl = cursorEl.querySelector('.veyra-cursor-flag');
                        if (flagEl) {
                            flagEl.textContent = data.name || 'Colaborador';
                            flagEl.style.backgroundColor = col;

                            // Si el cursor está en la primera línea o muy cerca del borde superior (< 24px),
                            // posicionar la etiqueta por DEBAJO de la línea del cursor para que nunca se corte bajo el input del título
                            if (finalTop < 24) {
                                flagEl.style.bottom = 'auto';
                                flagEl.style.top = '100%';
                                flagEl.style.marginTop = '2px';
                                flagEl.style.marginBottom = '0px';
                                flagEl.style.borderRadius = '0 4px 4px 4px';
                            } else {
                                flagEl.style.top = 'auto';
                                flagEl.style.bottom = '100%';
                                flagEl.style.marginTop = '0px';
                                flagEl.style.marginBottom = '2px';
                                flagEl.style.borderRadius = '4px 4px 4px 0';
                            }

                            // Evitar desborde lateral si el cursor está pegado al borde derecho de la pantalla
                            var screenW = window.innerWidth || document.documentElement.clientWidth || 360;
                            if (finalLeft > screenW - 80) {
                                flagEl.style.left = 'auto';
                                flagEl.style.right = '-2px';
                            } else {
                                flagEl.style.right = 'auto';
                                flagEl.style.left = '-2px';
                            }
                        }

                        if (cursorTimers[data.clientId]) {
                            clearTimeout(cursorTimers[data.clientId]);
                        }
                        cursorTimers[data.clientId] = setTimeout(function() {
                            if (cursorEl) {
                                cursorEl.style.opacity = '0';
                                setTimeout(function() {
                                    if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
                                }, 300);
                            }
                        }, 12000);
                    } catch(err) {}
                }

                function refreshAllRemoteCursors() {
                    try {
                        if (!window.__veyraRemoteCursors) return;
                        for (var cid in window.__veyraRemoteCursors) {
                            if (window.__veyraRemoteCursors.hasOwnProperty(cid)) {
                                renderRemoteCursor(window.__veyraRemoteCursors[cid]);
                            }
                        }
                    } catch(e) {}
                }

                window.__veyraUpdateRemoteCursor = function(data) {
                    try {
                        if (!data || !data.clientId) return;
                        window.__veyraRemoteCursors[data.clientId] = data;
                        renderRemoteCursor(data);
                    } catch(err) {}
                };

                window.__veyraRemoveRemoteCursor = function(clientId) {
                    try {
                        if (window.__veyraRemoteCursors) {
                            delete window.__veyraRemoteCursors[clientId];
                        }
                        var id = 'veyra-cursor-' + clientId;
                        var cursorEl = document.getElementById(id);
                        if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
                    } catch(err) {}
                };

                // 5. Medición semántica y reporte al cliente nativo
                var lastSentCursor = null;
                var cursorMeasureTimeout = null;

                function reportCursor() {
                    try {
                        var sel = window.getSelection();
                        var isSelectionInEditor = sel && sel.rangeCount > 0 && editor && (editor.contains(sel.anchorNode) || editor === sel.anchorNode);
                        var isFocused = (document.activeElement === editor || (editor && editor.contains(document.activeElement)) || isSelectionInEditor);
                        if (!isFocused) return;

                        if (!sel || sel.rangeCount === 0) return;
                        var range = sel.getRangeAt(0);

                        var coords = getCaretCoordinates();
                        if (!coords || (coords.top === 0 && coords.left === 0 && editor && editor.textContent.trim().length > 0)) {
                            return;
                        }

                        // Identificar bloque principal contenedor directo de #editor
                        var anchorNode = range.startContainer;
                        var blockNode = null;
                        if (anchorNode && editor.contains(anchorNode)) {
                            var curr = anchorNode;
                            while (curr && curr.parentNode !== editor) {
                                curr = curr.parentNode;
                            }
                            if (curr && curr.parentNode === editor) {
                                blockNode = curr;
                            }
                        }

                        var blockIndex = 0;
                        var charOffset = 0;
                        if (blockNode) {
                            blockIndex = Array.prototype.indexOf.call(editor.childNodes, blockNode);
                            charOffset = getCaretOffset(blockNode);
                        } else if (anchorNode === editor) {
                            blockIndex = Math.min(range.startOffset, Math.max(0, editor.childNodes.length - 1));
                            charOffset = 0;
                        }

                        var globalCharOffset = getCaretOffset(editor);

                        var payload = {
                            blockIndex: blockIndex,
                            charOffset: charOffset,
                            globalCharOffset: globalCharOffset,
                            top: coords.top,
                            left: coords.left,
                            height: coords.height || 22,
                            collapsed: true
                        };

                        if (lastSentCursor &&
                            lastSentCursor.blockIndex === payload.blockIndex &&
                            lastSentCursor.charOffset === payload.charOffset &&
                            Math.abs(lastSentCursor.top - payload.top) < 2 &&
                            Math.abs(lastSentCursor.left - payload.left) < 2) {
                            return;
                        }
                        lastSentCursor = payload;

                        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'CURSOR_ACTIVITY',
                                cursor: payload
                            }));
                        }
                    } catch(e) {}
                }

                function onSelectionChange() {
                    var sel = window.getSelection();
                    var isSelectionInEditor = sel && sel.rangeCount > 0 && editor && (editor.contains(sel.anchorNode) || editor === sel.anchorNode);
                    var isFocused = (document.activeElement === editor || (editor && editor.contains(document.activeElement)) || isSelectionInEditor);
                    if (!isFocused) return;
                    if (cursorMeasureTimeout) clearTimeout(cursorMeasureTimeout);
                    cursorMeasureTimeout = setTimeout(reportCursor, 25);
                }

                if (!window.__veyraCollabEventsAttached) {
                    window.__veyraCollabEventsAttached = true;
                    document.addEventListener('selectionchange', onSelectionChange, true);
                    editor.addEventListener('keyup', onSelectionChange, true);
                    editor.addEventListener('pointerup', onSelectionChange, true);
                    editor.addEventListener('touchend', onSelectionChange, true);
                    editor.addEventListener('input', function() {
                        onSelectionChange();
                        refreshAllRemoteCursors();
                    }, true);
                    window.addEventListener('resize', refreshAllRemoteCursors, { passive: true });
                    editor.addEventListener('focus', onSelectionChange, true);
                    editor.addEventListener('blur', function() {
                        lastSentCursor = null;
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'CURSOR_REMOVE'
                            }));
                        }
                    }, true);
                }

                // 6. Motor de reconciliación DOM no destructivo por bloques (permite edición simultánea)
                // Motor de reconciliación DOM no destructivo v2 — edición simultánea sin saltos de cursor
                // Estrategia: capturar offset ANTES de mutar el DOM, restaurar con rAF DESPUÉS
                // para que el browser haya recalculado el layout antes de reposicionar la selección.
                window.__veyraApplyRemoteContent = function(newHtml) {
                    if (!editor || editor.innerHTML === newHtml) return;
                    window.__veyraIsApplyingRemote = true;

                    var isFocused = (document.activeElement === editor || editor.contains(document.activeElement));
                    if (!isFocused) {
                        // Sin foco local: reemplazar libremente y liberar el flag
                        editor.innerHTML = newHtml;
                        setTimeout(function() {
                            window.__veyraIsApplyingRemote = false;
                            refreshAllRemoteCursors();
                        }, 80);
                        return;
                    }

                    // --- Capturar estado de selección ANTES de cualquier mutación DOM ---
                    var sel = window.getSelection();
                    var anchorNode = (sel && sel.rangeCount > 0) ? sel.anchorNode : null;
                    var localActiveBlock = null;

                    if (anchorNode && editor.contains(anchorNode)) {
                        var curr = anchorNode;
                        while (curr && curr.parentNode !== editor) {
                            curr = curr.parentNode;
                        }
                        if (curr && curr.parentNode === editor) {
                            localActiveBlock = curr;
                        }
                    }

                    var tempDiv = document.createElement('div');
                    tempDiv.innerHTML = newHtml;

                    // Caso: sin bloque activo identificable → reemplazar todo y restituir offset global
                    if (!localActiveBlock || tempDiv.childNodes.length === 0) {
                        var savedGlobal = getCaretOffset(editor);
                        editor.innerHTML = newHtml;
                        requestAnimationFrame(function() {
                            try { setCaretOffset(editor, savedGlobal); } catch(e) {}
                            window.__veyraIsApplyingRemote = false;
                            refreshAllRemoteCursors();
                        });
                        return;
                    }

                    // --- Capturar offset dentro del bloque activo ANTES de mutarlo ---
                    var caretInBlock = getCaretOffset(localActiveBlock);
                    var activeIndex = Array.prototype.indexOf.call(editor.childNodes, localActiveBlock);
                    var sChildren = Array.prototype.slice.call(tempDiv.childNodes);
                    var tChildren = Array.prototype.slice.call(editor.childNodes);
                    var blockToFocus = localActiveBlock;  // referencia que actualizaremos si se reemplaza
                    var offsetToRestore = caretInBlock;

                    try {
                        for (var i = 0; i < sChildren.length; i++) {
                            var sChild = sChildren[i];
                            var tChild = tChildren[i];

                            if (i === activeIndex) {
                                // Bloque que el usuario local está editando actualmente
                                if (sChild.outerHTML !== blockToFocus.outerHTML) {
                                    var oldText = blockToFocus.textContent || '';
                                    var newText = sChild.textContent || '';

                                    // Calcular cuántos caracteres de prefijo son comunes
                                    // para saber si el remoto insertó ANTES del cursor local
                                    var prefixLen = 0;
                                    var minLen = Math.min(oldText.length, newText.length);
                                    while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
                                        prefixLen++;
                                    }

                                    // Solo ajustar si el remoto modificó algo antes de donde está el cursor
                                    if (prefixLen < offsetToRestore) {
                                        var delta = newText.length - oldText.length;
                                        offsetToRestore = Math.max(0, offsetToRestore + delta);
                                    }

                                    var replacement = sChild.cloneNode(true);
                                    editor.replaceChild(replacement, blockToFocus);
                                    blockToFocus = replacement;   // actualizar referencia
                                }
                                // Si el HTML coincide exactamente, no tocar el bloque → cero interferencia
                            } else if (tChild) {
                                if (tChild.outerHTML !== sChild.outerHTML) {
                                    editor.replaceChild(sChild.cloneNode(true), tChild);
                                }
                            } else {
                                editor.appendChild(sChild.cloneNode(true));
                            }
                        }

                        // Eliminar nodos extra si el remoto borró párrafos al final
                        while (editor.childNodes.length > sChildren.length) {
                            var lastNode = editor.lastChild;
                            if (lastNode && lastNode !== blockToFocus) {
                                editor.removeChild(lastNode);
                            } else {
                                break;
                            }
                        }
                    } catch(err) {
                        // Fallback seguro: reemplazar todo y restituir offset global
                        var savedGlobal2 = offsetToRestore;
                        editor.innerHTML = newHtml;
                        requestAnimationFrame(function() {
                            try { setCaretOffset(editor, savedGlobal2); } catch(e) {}
                            window.__veyraIsApplyingRemote = false;
                            refreshAllRemoteCursors();
                        });
                        return;
                    }

                    // Restaurar cursor UNA SOLA VEZ con rAF para que el layout esté actualizado
                    // Mantener __veyraIsApplyingRemote=true hasta después de restaurar
                    // para que notifyChange() no haga eco del contenido remoto
                    var _blockToFocus = blockToFocus;
                    var _offsetToRestore = offsetToRestore;
                    requestAnimationFrame(function() {
                        try {
                            if (_blockToFocus && document.contains(_blockToFocus)) {
                                setCaretOffset(_blockToFocus, _offsetToRestore);
                            }
                        } catch(e) {}
                        window.__veyraIsApplyingRemote = false;
                        refreshAllRemoteCursors();
                    });
                };
            })();
            true;
        `;
        try {
            ref.injectJavascript?.(script);
            ref.injectJavaScript?.(script);
            ref.webviewBridge?.injectJavaScript?.(script);
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
            injectCollabHandlerScript();
        }, 300);
        return () => clearTimeout(t1);
    }, [injectImageHandlerScript, injectCheckboxHandlerScript, injectCollabHandlerScript]);

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

    const injectFontHandlerScript = useCallback(() => {
        const ref = activeRefHolder.current?.current;
        if (!ref) return;
        const fontCss = getFontFamilyCss(fontFamily);
        const fontsJson = JSON.stringify(
            NOTE_FONTS.map(f => ({
                id: f.id,
                name: f.name,
                fontName: f.fontName,
                family: f.family,
            }))
        );
        const accentColor = accent.primary;
        const isDarkMode = !!isDark;

        const script = `
            (function() {
                try {
                    if (!document.querySelector('meta[charset]')) {
                        var meta = document.createElement('meta');
                        meta.setAttribute('charset', 'utf-8');
                        if (document.head) document.head.prepend(meta);
                    }
                } catch(e) {}

                window.__veyraSetBaseFont = function(css) {
                    try {
                        var styleEl = document.getElementById('veyra-dynamic-base-font');
                        if (!styleEl) {
                            styleEl = document.createElement('style');
                            styleEl.id = 'veyra-dynamic-base-font';
                            document.head.appendChild(styleEl);
                        }
                        styleEl.textContent = 'html, body, #editor, .pell-content, .pell-content p, .pell-content div { font-family: ' + css + ' !important; }';

                        var ed = document.querySelector('.pell-content') || document.getElementById('editor') || document.body;
                        if (ed) {
                            ed.style.setProperty('font-family', css, 'important');
                            var fontEls = ed.querySelectorAll('font[face]');
                            var changed = false;
                            for (var i = 0; i < fontEls.length; i++) {
                                fontEls[i].removeAttribute('face');
                                changed = true;
                            }
                            var spans = ed.querySelectorAll('span[style*="font-family"]');
                            for (var j = 0; j < spans.length; j++) {
                                spans[j].style.removeProperty('font-family');
                                changed = true;
                            }
                            if (changed && window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'CONTENT_CHANGE',
                                    data: ed.innerHTML
                                }));
                            }
                        }
                        document.body.style.setProperty('font-family', css, 'important');
                    } catch(e) {}
                };

                var _lastSavedRange = null;
                var _fontsList = ${fontsJson};
                var _accent = "${accentColor}";
                var _isDark = ${isDarkMode ? 'true' : 'false'};

                // Crear o actualizar contenedor de tooltip flotante y popover de fuentes
                var tooltipEl = document.getElementById('veyra-font-tooltip');
                var popoverEl = document.getElementById('veyra-font-popover');

                if (!tooltipEl) {
                    tooltipEl = document.createElement('div');
                    tooltipEl.id = 'veyra-font-tooltip';
                    tooltipEl.style.cssText = 'position:fixed; z-index:999999; display:none; align-items:center; justify-content:center; border-radius:20px; box-shadow:0 4px 18px rgba(0,0,0,0.28); padding:5px 12px; cursor:pointer; user-select:none; -webkit-user-select:none; backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); gap:5px; font-family:-apple-system, sans-serif; transition:opacity 0.15s ease, transform 0.15s ease;';
                    document.body.appendChild(tooltipEl);
                }

                if (!popoverEl) {
                    popoverEl = document.createElement('div');
                    popoverEl.id = 'veyra-font-popover';
                    popoverEl.style.cssText = 'position:fixed; z-index:1000000; display:none; flex-direction:column; width:180px; max-height:220px; overflow-y:auto; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.38); padding:5px; user-select:none; -webkit-user-select:none; backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); font-family:-apple-system, sans-serif;';
                    document.body.appendChild(popoverEl);
                }

                // Aplicar estilos según tema actual
                var bgTooltip = _isDark ? 'rgba(22, 25, 36, 0.94)' : 'rgba(255, 255, 255, 0.96)';
                var borderTooltip = _isDark ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid rgba(0, 0, 0, 0.1)';
                var textColor = _isDark ? '#F4F4F5' : '#0F172A';
                var textSubColor = _isDark ? '#A1A1AA' : '#64748B';
                var hoverBg = _isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

                tooltipEl.style.background = bgTooltip;
                tooltipEl.style.border = borderTooltip;
                tooltipEl.innerHTML = '<span style="font-size:13px; font-weight:800; color:' + _accent + ';">Aa</span><span style="font-size:12px; font-weight:600; color:' + textColor + ';">Fuente</span><span style="font-size:8px; opacity:0.65; color:' + textSubColor + ';">▼</span>';

                popoverEl.style.background = bgTooltip;
                popoverEl.style.border = borderTooltip;

                // Contenido del popover con la lista de fuentes
                var popoverHtml = '<div class="veyra-font-pop-item" data-font="Plus Jakarta Sans" style="display:flex; align-items:center; padding:7px 10px; border-radius:7px; font-size:12.5px; color:' + _accent + '; font-weight:700; cursor:pointer; gap:6px; border-bottom:1px solid ' + (_isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') + '; margin-bottom:3px;"><span style="font-size:11px;">↺</span> Original</div>';

                for (var f = 0; f < _fontsList.length; f++) {
                    var item = _fontsList[f];
                    popoverHtml += '<div class="veyra-font-pop-item" data-font="' + item.fontName + '" style="display:flex; align-items:center; padding:7px 10px; border-radius:7px; font-size:13.5px; font-family:' + item.family + '; color:' + textColor + '; cursor:pointer; transition:background 0.12s ease;">' + item.name + '</div>';
                }
                popoverEl.innerHTML = popoverHtml;

                function hideAll() {
                    if (tooltipEl) tooltipEl.style.display = 'none';
                    if (popoverEl) popoverEl.style.display = 'none';
                }

                function togglePopover(e) {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    if (popoverEl.style.display === 'flex') {
                        popoverEl.style.display = 'none';
                        return;
                    }
                    var tRect = tooltipEl.getBoundingClientRect();
                    var popWidth = 180;
                    var popLeft = Math.max(8, Math.min(window.innerWidth - popWidth - 8, tRect.left + (tRect.width / 2) - (popWidth / 2)));
                    var popTop = tRect.bottom + 6;
                    if (popTop + 220 > window.innerHeight) {
                        popTop = Math.max(10, tRect.top - 226);
                    }
                    popoverEl.style.left = popLeft + 'px';
                    popoverEl.style.top = popTop + 'px';
                    popoverEl.style.display = 'flex';
                }

                tooltipEl.onmousedown = tooltipEl.ontouchstart = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePopover(e);
                };

                // Asignar click a cada elemento de fuente en el popover
                var items = popoverEl.querySelectorAll('.veyra-font-pop-item');
                for (var it = 0; it < items.length; it++) {
                    items[it].onmousedown = items[it].ontouchstart = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        var chosenFont = this.getAttribute('data-font');
                        window.__veyraApplyFont(chosenFont);
                        hideAll();
                    };
                }

                window.__veyraApplyFont = function(fontName) {
                    try {
                        var sel = window.getSelection();
                        if (_lastSavedRange && (!sel || sel.rangeCount === 0 || sel.isCollapsed)) {
                            sel.removeAllRanges();
                            sel.addRange(_lastSavedRange);
                        }
                        document.execCommand('fontName', false, fontName);
                        var ed = document.querySelector('.pell-content') || document.getElementById('editor') || document.body;
                        if (ed && window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'CONTENT_CHANGE',
                                data: ed.innerHTML
                            }));
                        }
                    } catch(e) {}
                };

                // Posicionamiento dinámico del tooltip sobre el texto seleccionado
                var _selectionTimer = null;
                function checkSelection() {
                    clearTimeout(_selectionTimer);
                    _selectionTimer = setTimeout(function() {
                        try {
                            var sel = window.getSelection();
                            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                                hideAll();
                                return;
                            }
                            var range = sel.getRangeAt(0);
                            var rect = range.getBoundingClientRect();
                            if (rect.width === 0 && rect.height === 0) {
                                hideAll();
                                return;
                            }
                            _lastSavedRange = range.cloneRange();

                            var tw = tooltipEl.offsetWidth || 95;
                            var th = tooltipEl.offsetHeight || 32;

                            var top = rect.top - th - 8;
                            if (top < 10) {
                                top = rect.bottom + 8;
                            }
                            var left = rect.left + (rect.width / 2) - (tw / 2);
                            left = Math.max(10, Math.min(window.innerWidth - tw - 10, left));

                            tooltipEl.style.top = top + 'px';
                            tooltipEl.style.left = left + 'px';
                            tooltipEl.style.display = 'flex';
                        } catch(e) {}
                    }, 80);
                }

                document.addEventListener('selectionchange', checkSelection);
                document.addEventListener('touchend', checkSelection);
                document.addEventListener('mouseup', checkSelection);

                window.addEventListener('scroll', function() {
                    hideAll();
                }, { passive: true });

                document.addEventListener('touchstart', function(e) {
                    if (tooltipEl && tooltipEl.contains(e.target)) return;
                    if (popoverEl && popoverEl.contains(e.target)) return;
                    hideAll();
                });

                window.__veyraSetBaseFont("${fontCss.replace(/"/g, '\\"')}");
            })();
            true;
        `;
        try {
            ref.injectJavascript?.(script);
            ref.injectJavaScript?.(script);
            ref.webviewBridge?.injectJavaScript?.(script);
        } catch (e) {}
    }, [fontFamily, accent.primary, isDark]);

    useEffect(() => {
        injectFontHandlerScript();
        injectCollabHandlerScript();
    }, [fontFamily, injectFontHandlerScript, injectCollabHandlerScript]);

    useEffect(() => {
        const ref = activeRefHolder.current?.current;
        if (!ref) return;
        if (readOnly) {
            const script = `
                (function() {
                    try {
                        var ed = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor') || document.body;
                        if (ed) {
                            ed.setAttribute('contenteditable', 'false');
                            ed.blur();
                        }
                        if (document.activeElement && document.activeElement.blur) {
                            document.activeElement.blur();
                        }
                    } catch(e) {}
                })();
                true;
            `;
            try {
                ref.injectJavascript?.(script);
                ref.injectJavaScript?.(script);
                ref.webviewBridge?.injectJavaScript?.(script);
                ref.blurContentEditor?.();
            } catch (e) {}
        } else {
            const script = `
                (function() {
                    try {
                        var ed = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor') || document.body;
                        if (ed) {
                            ed.setAttribute('contenteditable', 'true');
                        }
                    } catch(e) {}
                })();
                true;
            `;
            try {
                ref.injectJavascript?.(script);
                ref.injectJavaScript?.(script);
                ref.webviewBridge?.injectJavaScript?.(script);
            } catch (e) {}
        }
        injectImageHandlerScript();
    }, [readOnly, injectImageHandlerScript]);

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
                    styleWithCSS={true}
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
                        injectFontHandlerScript();
                        injectCollabHandlerScript();
                    }}
                    editorStyle={{
                        backgroundColor: flat ? 'transparent' : colors.surface,
                        color: colors.textPrimary,
                        placeholderColor: colors.textMuted,
                        contentCSSText: `
                            font-size: ${flat ? '16px' : '14.5px'}; 
                            line-height: ${flat ? '24px' : '20px'}; 
                            padding: ${readOnly ? '4px 0px 16px 0px' : (flat ? '10px 0px 48px 0px' : '10px 12px')};
                            font-family: ${activeFontCss};
                            min-height: ${flat ? `${calculatedMinHeight}px` : (readOnly ? 'auto' : `${calculatedMinHeight}px`)};
                            box-sizing: border-box;
                        `,
                        cssText: `
                            ${GOOGLE_FONTS_CSS_IMPORT}
                            ${NOTE_FONTS_OVERRIDE_CSS}
                            html, body {
                                min-height: 100% !important;
                                height: 100% !important;
                                margin: 0;
                                padding: 0;
                                font-family: ${activeFontCss};
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
                                font-family: ${activeFontCss} !important;
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
