/**
 * bookmarkprompt-nodeview.js
 * NodeView de Entrada Inline para Tarjetas de Enlace Web en Veyra Móvil.
 * Mismo comportamiento minimalista y flat que /ia: en la misma línea sin alertas ni prompts.
 * Incluye switch para alternar entre "Tarjeta" y "Solo enlace" (ideal para bibliografías).
 */

export class BookmarkPromptNodeView {
    constructor(node, view, getPos, editor) {
        this.node = node;
        this.view = view;
        this.getPos = getPos;
        this.editor = editor;
        this.onlyLink = false;
        this.hasEverHadContent = false;

        this.initDOM();
    }

    initDOM() {
        this.dom = document.createElement('div');
        this.dom.className = 'veyra-ai-prompt-wrapper';
        this.dom.setAttribute('contenteditable', 'false');

        const container = document.createElement('div');
        container.className = 'veyra-ai-prompt-container';

        const label = document.createElement('span');
        label.className = 'veyra-ai-prompt-label';
        label.textContent = '/enlace';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'veyra-ai-prompt-input';
        input.placeholder = 'Pega o escribe la URL (ej: wikipedia.org)...';
        this.input = input;

        // Switch Solo Enlace (para bibliografías)
        const switchWrapper = document.createElement('div');
        switchWrapper.className = 'veyra-ai-switch-wrapper';
        switchWrapper.title = 'Solo enlace plano (ideal para bibliografías)';

        const switchLabel = document.createElement('span');
        switchLabel.className = 'veyra-ai-switch-label';
        switchLabel.textContent = 'Solo enlace';

        const switchTrack = document.createElement('div');
        switchTrack.className = 'veyra-ai-switch-track';

        const switchThumb = document.createElement('div');
        switchThumb.className = 'veyra-ai-switch-thumb';
        switchTrack.appendChild(switchThumb);

        switchWrapper.appendChild(switchLabel);
        switchWrapper.appendChild(switchTrack);

        switchWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onlyLink = !this.onlyLink;
            if (this.onlyLink) {
                switchTrack.classList.add('active');
                switchLabel.classList.add('active');
                input.placeholder = 'URL para enlace de texto (ej: https://...)...';
            } else {
                switchTrack.classList.remove('active');
                switchLabel.classList.remove('active');
                input.placeholder = 'Pega o escribe la URL (ej: wikipedia.org)...';
            }
            input.focus();
        });

        const action = document.createElement('div');
        action.className = 'veyra-ai-prompt-action';
        this.action = action;
        this.renderActionButtons();

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(switchWrapper);
        container.appendChild(action);
        this.dom.appendChild(container);

        container.addEventListener('mousedown', (e) => e.stopPropagation());
        container.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        container.addEventListener('click', (e) => {
            e.stopPropagation();
            input.focus();
        });

        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        input.addEventListener('click', (e) => e.stopPropagation());

        input.addEventListener('input', (e) => {
            e.stopPropagation();
            if (input.value.trim().length > 0) {
                this.hasEverHadContent = true;
            }
        });

        input.addEventListener('beforeinput', (e) => {
            e.stopPropagation();
        });

        input.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });

        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                this.cancel();
            } else if (e.key === 'Backspace' && !input.value && !this.hasEverHadContent) {
                e.preventDefault();
                this.cancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.submit();
            }
        });

        setTimeout(() => input.focus(), 60);
    }

    renderActionButtons() {
        this.action.innerHTML = '';

        const closeBtn = document.createElement('span');
        closeBtn.className = 'veyra-ai-close-badge';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Cancelar';
        closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        closeBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cancel();
        });

        const enterBtn = document.createElement('span');
        enterBtn.className = 'veyra-ai-enter-badge';
        enterBtn.innerHTML = '↵';
        enterBtn.title = 'Insertar enlace';
        enterBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        enterBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        enterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.submit();
        });

        this.action.appendChild(closeBtn);
        this.action.appendChild(enterBtn);
    }

    cancel() {
        const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
        if (typeof pos !== 'number') return;
        this.editor
            .chain()
            .focus()
            .deleteRange({ from: pos, to: pos + 1 })
            .insertContent('<p></p>')
            .run();
    }

    async submit() {
        const val = this.input.value.trim();
        if (!val) {
            this.cancel();
            return;
        }

        const fullUrl = val.startsWith('http://') || val.startsWith('https://') ? val : `https://${val}`;

        const pos = typeof this.getPos === 'function' ? this.getPos() : this.getPos;
        if (typeof pos !== 'number') return;

        // Si el usuario activó "Solo enlace", inserta de inmediato el hipervínculo en texto plano
        if (this.onlyLink) {
            this.editor
                .chain()
                .focus()
                .deleteRange({ from: pos, to: pos + 1 })
                .insertContent(`<p><a href="${fullUrl}" target="_blank" rel="noopener noreferrer nofollow">${val}</a>&nbsp;</p>`)
                .run();
            return;
        }

        let domain = val;
        let favicon = '';
        try {
            const parsed = new URL(fullUrl);
            domain = parsed.hostname.replace(/^www\./, '');
            favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        } catch (_) {}

        // Inserción inmediata con esqueleto animado (0ms)
        this.editor
            .chain()
            .focus()
            .deleteRange({ from: pos, to: pos + 1 })
            .insertContent({
                type: 'bookmark',
                attrs: {
                    url: fullUrl,
                    title: domain,
                    domain,
                    favicon,
                    description: '',
                    image: null,
                    isLoading: true,
                },
            })
            .run();

        // Carga de metadatos OpenGraph en segundo plano
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        fetch(`https://api.microlink.io?url=${encodeURIComponent(fullUrl)}`, {
            signal: controller.signal,
        })
            .then(r => r.ok ? r.json() : null)
            .then(json => {
                clearTimeout(timeout);
                let title = domain;
                let description = '';
                let metaFavicon = favicon;
                let image = null;
                if (json && json.status === 'success' && json.data) {
                    title = json.data.title || title;
                    description = json.data.description || '';
                    metaFavicon = json.data.logo?.url || favicon;
                    image = json.data.image?.url || null;
                }
                if (this.editor && !this.editor.isDestroyed) {
                    const { state } = this.editor;
                    state.doc.descendants((node, p) => {
                        if (node.type.name === 'bookmark' && node.attrs.url === fullUrl && node.attrs.isLoading) {
                            this.editor.chain().setNodeMarkup(p, undefined, {
                                ...node.attrs,
                                title,
                                description,
                                favicon: metaFavicon,
                                image,
                                isLoading: false,
                            }).run();
                            return false;
                        }
                    });
                }
            })
            .catch(() => {
                clearTimeout(timeout);
                if (this.editor && !this.editor.isDestroyed) {
                    const { state } = this.editor;
                    state.doc.descendants((node, p) => {
                        if (node.type.name === 'bookmark' && node.attrs.url === fullUrl && node.attrs.isLoading) {
                            this.editor.chain().setNodeMarkup(p, undefined, {
                                ...node.attrs,
                                isLoading: false,
                            }).run();
                            return false;
                        }
                    });
                }
            });
    }

    stopEvent() {
        return true;
    }

    ignoreMutation() {
        return true;
    }
}
