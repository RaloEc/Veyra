/**
 * aiprompt-nodeview.js
 * NodeView de Entrada de Asistente IA para el editor móvil de Veyra.
 * Minimalista, flat, en la misma línea, adaptativo a modo claro/oscuro.
 */

export class AIPromptNodeView {
    constructor(node, view, getPos, editor) {
        this.node = node;
        this.view = view;
        this.getPos = getPos;
        this.editor = editor;
        this.isLoading = false;
        this.requestId = 'ai_' + Math.random().toString(36).substring(2, 9);

        this.initDOM();
        this.registerGlobalHandler();
    }

    initDOM() {
        this.dom = document.createElement('div');
        this.dom.className = 'veyra-ai-prompt-wrapper';
        this.dom.setAttribute('contenteditable', 'false');

        const container = document.createElement('div');
        container.className = 'veyra-ai-prompt-container';

        const label = document.createElement('span');
        label.className = 'veyra-ai-prompt-label';
        label.textContent = '/ia';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'veyra-ai-prompt-input';
        input.placeholder = 'Escribe tu orden y presiona Enter...';
        this.input = input;

        const action = document.createElement('div');
        action.className = 'veyra-ai-prompt-action';
        action.innerHTML = '<span class="veyra-ai-enter-badge">↵</span>';
        this.action = action;

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(action);
        this.dom.appendChild(container);

        // Prevenir interferencia de ProseMirror y permitir recuperar foco con un click
        container.addEventListener('mousedown', (e) => e.stopPropagation());
        container.addEventListener('click', (e) => {
            e.stopPropagation();
            input.focus();
        });
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('click', (e) => e.stopPropagation());

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.cancel();
            } else if (e.key === 'Backspace' && !input.value) {
                e.preventDefault();
                this.cancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.submit();
            }
        });

        setTimeout(() => input.focus(), 60);
    }

    registerGlobalHandler() {
        if (!window.__veyraAIHandlers) {
            window.__veyraAIHandlers = new Map();
        }
        window.__veyraAIHandlers.set(this.requestId, (result) => {
            this.handleResult(result);
        });
    }

    cancel() {
        if (this.isLoading) return;
        const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
        if (typeof pos !== 'number') return;
        this.editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).insertContent('<p></p>').run();
    }

    submit() {
        const prompt = this.input.value.trim();
        if (!prompt || this.isLoading) return;

        this.isLoading = true;
        this.input.disabled = true;
        this.action.innerHTML = '<span class="veyra-ai-loading">Generando...</span>';

        const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
        let textBefore = '';
        if (typeof pos === 'number') {
            try {
                textBefore = this.editor.state.doc.textBetween(0, pos, '\n', '\n').slice(-4000);
            } catch (err) {
                console.warn('[AIPromptNodeView] Error extracting textBefore:', err);
            }
        }

        // Enviar petición a React Native
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(
                JSON.stringify({
                    type: 'AI_GENERATE_REQUEST',
                    requestId: this.requestId,
                    prompt,
                    context: { textBefore },
                })
            );
        } else {
            this.handleResult({
                success: false,
                error: 'Entorno de React Native no disponible.',
            });
        }
    }

    handleResult(result) {
        this.isLoading = false;
        if (window.__veyraAIHandlers) {
            window.__veyraAIHandlers.delete(this.requestId);
        }

        const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
        if (typeof pos !== 'number') return;

        if (result && result.success && result.html) {
            this.editor
                .chain()
                .focus()
                .deleteRange({ from: pos, to: pos + 1 })
                .insertContent(result.html)
                .run();
        } else {
            this.input.disabled = false;
            this.action.innerHTML = '<span class="veyra-ai-enter-badge">↵</span>';
            const err = result?.error || 'Error al generar contenido con IA.';
            alert(err);
            this.input.focus();
        }
    }

    destroy() {
        if (window.__veyraAIHandlers) {
            window.__veyraAIHandlers.delete(this.requestId);
        }
    }
}

