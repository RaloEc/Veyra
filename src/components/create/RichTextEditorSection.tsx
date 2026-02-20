import { useRef } from 'react';
import { TouchableWithoutFeedback, Alert } from 'react-native';
import { YStack, XStack, Label } from 'tamagui';
import { FileText, Bold, List, AlignCenter } from '@tamagui/lucide-icons';
import { RichEditor, RichToolbar, actions } from 'react-native-pell-rich-editor';

interface RichTextEditorSectionProps {
    description: string;
    setDescription: (desc: string) => void;
    isDark: boolean;
    editorRef: any;
    onFocus?: () => void;
    onBlur?: () => void;
    flat?: boolean;
}

export function RichTextEditorSection({
    description,
    setDescription,
    isDark,
    editorRef,
    onFocus,
    onBlur,
    flat
}: RichTextEditorSectionProps) {

    return (
        <YStack gap="$3">
            {!flat && (
                <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }} gap="$2">
                    <XStack style={{ alignItems: 'center' }} gap="$2">
                        <FileText size={18} color="$purple10" />
                        <Label fontWeight="600" fontSize="$3" color={isDark ? '$gray9' : '$gray10'}>Notas</Label>
                    </XStack>
                </XStack>
            )}

            <YStack
                style={{
                    borderWidth: flat ? 0 : 1,
                    borderColor: isDark ? '#333' : '#ddd',
                    borderRadius: flat ? 0 : 16,
                    overflow: 'hidden',
                    backgroundColor: flat ? 'transparent' : (isDark ? '#111' : 'white'),
                }}
            >
                <RichEditor
                    ref={editorRef}
                    initialContentHTML={description}
                    onChange={setDescription}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    placeholder="Empieza a escribir..."
                    scrollEnabled={false}
                    initialHeight={flat ? 300 : 120}
                    autoCapitalize="sentences"
                    autoCorrect={true}
                    editorInitializedCallback={() => {
                        const script = `
                            (function() {
                                if (window.imgHandlerLoaded) return;
                                window.imgHandlerLoaded = true;
                                let activeImg = null;
                                let overlay = null;
                                
                                function updateOverlayPos(img) {
                                    if (!overlay) return;
                                    const rect = img.getBoundingClientRect();
                                    // Añadimos un pequeño margen de seguridad para los controles
                                    overlay.style.top = (rect.top + window.pageYOffset) + 'px';
                                    overlay.style.left = (rect.left + window.pageXOffset) + 'px';
                                    overlay.style.width = rect.width + 'px';
                                    overlay.style.height = rect.height + 'px';
                                    overlay.style.display = 'block';
                                }

                                document.addEventListener('touchstart', function(e) {
                                    if (e.target.tagName === 'IMG') {
                                        activeImg = e.target;
                                        if (!overlay) {
                                            overlay = document.createElement('div');
                                            overlay.style.cssText = 'position:absolute; border:2px solid #6366f1; pointer-events:none; z-index:1000; box-shadow: 0 0 15px rgba(99,102,241,0.5); border-radius:12px;';
                                            
                                            // Botón de Papelera - Movido un poco más adentro para evitar bordes cortados
                                            const trash = document.createElement('div');
                                            trash.innerHTML = '🗑️';
                                            trash.style.cssText = 'position:absolute; top:8px; right:8px; background:#ef4444; color:white; width:36px; height:36px; border-radius:18px; display:flex; align-items:center; justify-content:center; font-size:18px; pointer-events:auto; cursor:pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.4); z-index:1001; border:2px solid white;';
                                            trash.onclick = function(ev) {
                                                ev.stopPropagation();
                                                activeImg.remove();
                                                overlay.style.display = 'none';
                                                activeImg = null;
                                                document.dispatchEvent(new Event('input', { bubbles: true }));
                                            };

                                            const controls = document.createElement('div');
                                            controls.style.cssText = 'position:absolute; top:8px; left:8px; display:flex; gap:8px; pointer-events:auto;';

                                            const flipBtn = document.createElement('div');
                                            flipBtn.innerHTML = '↔️';
                                            flipBtn.style.cssText = 'background:#1a1a1a; color:white; width:36px; height:36px; border-radius:18px; display:flex; align-items:center; justify-content:center; font-size:18px; cursor:pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.4); border:2px solid #6366f1;';
                                            flipBtn.onclick = function(ev) {
                                                ev.stopPropagation();
                                                const currentFlip = activeImg.getAttribute('data-flip') || '1';
                                                const newFlip = currentFlip === '1' ? '-1' : '1';
                                                activeImg.setAttribute('data-flip', newFlip);
                                                applyTransforms(activeImg);
                                            };

                                            const rotateBtn = document.createElement('div');
                                            rotateBtn.innerHTML = '🔄';
                                            rotateBtn.style.cssText = 'background:#1a1a1a; color:white; width:36px; height:36px; border-radius:18px; display:flex; align-items:center; justify-content:center; font-size:18px; cursor:pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.4); border:2px solid #6366f1;';
                                            rotateBtn.onclick = function(ev) {
                                                ev.stopPropagation();
                                                const currentRot = parseInt(activeImg.getAttribute('data-rotate') || '0');
                                                const newRot = (currentRot + 90) % 360;
                                                activeImg.setAttribute('data-rotate', newRot.toString());
                                                applyTransforms(activeImg);
                                            };

                                            function applyTransforms(img) {
                                                const flip = img.getAttribute('data-flip') || '1';
                                                const rotate = img.getAttribute('data-rotate') || '0';
                                                img.style.transform = 'scaleX(' + flip + ') rotate(' + rotate + 'deg)';
                                                // Pequeño delay para que el navegador recalcule el rect
                                                setTimeout(() => updateOverlayPos(img), 100);
                                            }
                                            
                                            const handle = document.createElement('div');
                                            handle.style.cssText = 'position:absolute; bottom:8px; right:8px; background:#6366f1; width:28px; height:28px; border-radius:14px; pointer-events:auto; cursor:nwse-resize; border:3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.4); z-index:1001;';
                                            
                                            let isResizing = false;
                                            let startX, startW;
                                            
                                            handle.addEventListener('touchstart', function(ev) {
                                                isResizing = true;
                                                startX = ev.touches[0].clientX;
                                                startW = activeImg.offsetWidth;
                                                ev.preventDefault();
                                                ev.stopPropagation();
                                            }, {passive: false});
                                            
                                            window.addEventListener('touchmove', function(ev) {
                                                if (!isResizing || !activeImg) return;
                                                const delta = ev.touches[0].clientX - startX;
                                                activeImg.style.width = Math.max(60, startW + delta) + 'px';
                                                activeImg.style.height = 'auto';
                                                updateOverlayPos(activeImg);
                                            }, {passive: false});
                                            
                                            window.addEventListener('touchend', function() {
                                                isResizing = false;
                                            });
                                            
                                            controls.appendChild(flipBtn);
                                            controls.appendChild(rotateBtn);
                                            overlay.appendChild(trash);
                                            overlay.appendChild(controls);
                                            overlay.appendChild(handle);
                                            document.body.appendChild(overlay);
                                        }
                                        updateOverlayPos(activeImg);
                                    } else if (overlay && !overlay.contains(e.target)) {
                                        overlay.style.display = 'none';
                                        activeImg = null;
                                    }
                                });
                                
                                window.addEventListener('scroll', () => {
                                    if (activeImg) updateOverlayPos(activeImg);
                                });
                            })();
                            true; // Return true to avoid any issues
                        `;
                        // Usamos un pequeño delay para asegurar que el ref está listo
                        // y usamos la acción nativa de ejecución para no romper el DOM
                        setTimeout(() => {
                            if (editorRef.current) {
                                // @ts-ignore - injectJavaScript might be missing in types but exists in JS
                                if (typeof editorRef.current.injectJavaScript === 'function') {
                                    editorRef.current.injectJavaScript(script);
                                } else {
                                    // Fallback compatible
                                    editorRef.current.sendAction('executor', script);
                                }
                            }
                        }, 500);
                    }}
                    editorStyle={{
                        backgroundColor: flat ? 'transparent' : (isDark ? '#111' : 'white'),
                        color: isDark ? 'white' : 'black',
                        placeholderColor: isDark ? '#444' : '#aaa',
                        contentCSSText: `
                            font-size: 18px; 
                            line-height: 26px; 
                            padding: ${flat ? '0px' : '12px'};
                        `,
                        cssText: `
                            img {
                                max-width: 100%;
                                height: auto;
                                display: block;
                                margin: 20px auto;
                                border-radius: 12px;
                                cursor: pointer;
                                -webkit-tap-highlight-color: rgba(0,0,0,0);
                            }
                        `
                    }}
                />
            </YStack>
        </YStack>
    );
}
