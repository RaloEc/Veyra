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
        action.innerHTML = '<span class="veyra-ai-enter-badge">↵</span>';
        this.action = action;

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(switchWrapper);
        container.appendChild(action);
        this.dom.appendChild(container);

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
        let title = val;
        let description = '';
        let image = null;

        try {
            const parsed = new URL(fullUrl);
            domain = parsed.hostname.replace(/^www\./, '');
            favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
            title = domain;

            // Mostrar estado cargando en el badge
            this.action.innerHTML = '<span class="veyra-ai-spinner"></span>';
            this.input.disabled = true;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(fullUrl)}`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (res.ok) {
                const json = await res.json();
                if (json.status === 'success' && json.data) {
                    title = json.data.title || title;
                    description = json.data.description || '';
                    favicon = json.data.logo?.url || favicon;
                    image = json.data.image?.url || null;
                }
            }
        } catch (_) {
            // Fallback silencioso
        }

        this.editor
            .chain()
            .focus()
            .deleteRange({ from: pos, to: pos + 1 })
            .insertContent({
                type: 'bookmark',
                attrs: {
                    url: fullUrl,
                    title,
                    domain,
                    favicon,
                    description,
                    image,
                },
            })
            .run();
    }

    stopEvent() {
        return true;
    }

    ignoreMutation() {
        return true;
    }
}
